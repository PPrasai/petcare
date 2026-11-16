import { entities } from '@petcare/domain';
import type { RecordType } from '@petcare/domain';
import type { Clock, IdGenerator } from '../../application/ports/runtime';
import type { LocalDb, LocalRecord } from '../local/local-db';
import { enqueue, entriesFor } from './outbox';

export interface LocalStoreDeps {
  db: LocalDb;
  clock: Clock;
  ids: IdGenerator;
  /** The signed-in user, stamped as createdBy/updatedBy on optimistic records. */
  actorId: string;
  /** Called after a local write so the engine can schedule a sync. */
  onWrite?: (types: RecordType[]) => void;
}

const dependentTypes = entities.filter((e) => e.parent === 'petId').map((e) => e.type);

/**
 * Local-first writes (CON-petcare-002 2.5.1): the record and its outbox entry are written in
 * one transaction. Records created here carry version 0 until the server confirms them.
 */
export class LocalStore {
  constructor(private readonly deps: LocalStoreDeps) {}

  get(type: RecordType, id: string): Promise<LocalRecord | undefined> {
    return this.deps.db.records(type).get(id);
  }

  async create(
    type: RecordType,
    householdId: string,
    data: Record<string, unknown>,
    id: string = this.deps.ids.next(),
  ): Promise<LocalRecord> {
    const { db, clock, actorId } = this.deps;
    const now = clock.now().toISOString();
    const record: LocalRecord = {
      id,
      type,
      householdId,
      version: 0,
      createdAt: now,
      createdBy: actorId,
      updatedAt: now,
      updatedBy: actorId,
      deletedAt: null,
      data,
      _pending: true,
    };
    await db.transaction('rw', [db.records(type), db.outbox], async () => {
      await db.records(type).put(record);
      await enqueue(db, {
        mutationId: this.deps.ids.next(),
        type,
        id,
        householdId,
        op: 'create',
        baseVersion: 0,
        fields: data,
        clientTime: now,
      });
    });
    this.deps.onWrite?.([type]);
    return record;
  }

  /** Several creates in one local transaction: all are written, or none (CON-003 2.5.2). */
  async createMany(
    householdId: string,
    items: { id?: string; type: RecordType; data: Record<string, unknown> }[],
  ): Promise<LocalRecord[]> {
    const { db, clock, actorId } = this.deps;
    const now = clock.now().toISOString();
    const records: LocalRecord[] = items.map(({ id, type, data }) => ({
      id: id ?? this.deps.ids.next(),
      type,
      householdId,
      version: 0,
      createdAt: now,
      createdBy: actorId,
      updatedAt: now,
      updatedBy: actorId,
      deletedAt: null,
      data,
      _pending: true,
    }));
    const types = [...new Set(items.map((i) => i.type))];
    await db.transaction('rw', [...types.map((t) => db.records(t)), db.outbox], async () => {
      for (const record of records) {
        await db.records(record.type).put(record);
        await enqueue(db, {
          mutationId: this.deps.ids.next(),
          type: record.type,
          id: record.id,
          householdId,
          op: 'create',
          baseVersion: 0,
          fields: record.data,
          clientTime: now,
        });
      }
    });
    if (types.length > 0) this.deps.onWrite?.(types);
    return records;
  }

  async update(
    type: RecordType,
    id: string,
    fields: Record<string, unknown>,
  ): Promise<LocalRecord> {
    const { db, clock, actorId } = this.deps;
    const now = clock.now().toISOString();
    const updated = await db.transaction('rw', [db.records(type), db.outbox], async () => {
      const current = await db.records(type).get(id);
      if (!current) throw new Error(`${type} ${id} not found`);
      const next: LocalRecord = {
        ...current,
        data: { ...current.data, ...fields },
        updatedAt: now,
        updatedBy: actorId,
        _pending: true,
      };
      await db.records(type).put(next);
      await enqueue(db, {
        mutationId: this.deps.ids.next(),
        type,
        id,
        householdId: current.householdId,
        op: 'update',
        baseVersion: current.version,
        fields,
        clientTime: now,
      });
      return next;
    });
    this.deps.onWrite?.([type]);
    return updated;
  }

  /** Deletes a record. A pet delete also hides its dependents (the server cascades). */
  async remove(type: RecordType, id: string): Promise<void> {
    const { db, clock, actorId } = this.deps;
    const now = clock.now().toISOString();
    const touched: RecordType[] = [type];
    await db.transaction('rw', [db.outbox, ...db.recordTables()], async () => {
      const current = await db.records(type).get(id);
      if (!current) return;
      const outcome = await enqueue(db, {
        mutationId: this.deps.ids.next(),
        type,
        id,
        householdId: current.householdId,
        op: 'delete',
        baseVersion: current.version,
        fields: {},
        clientTime: now,
      });
      if (outcome === 'eliminated') await db.records(type).delete(id);
      else {
        await db.records(type).put({
          ...current,
          deletedAt: now,
          updatedAt: now,
          updatedBy: actorId,
          _pending: true,
        });
      }
      if (type !== 'pet') return;
      for (const dependent of dependentTypes) {
        const rows = await db
          .records(dependent)
          .filter((r) => r.data.petId === id)
          .toArray();
        if (rows.length === 0) continue;
        touched.push(dependent);
        for (const row of rows) await this.dropWithPet(row, outcome === 'eliminated', now);
      }
    });
    this.deps.onWrite?.(touched);
  }

  /**
   * Takes a delete back (the Undo toast). While the delete is still waiting in the outbox it is
   * simply withdrawn; if the create was never sent the record is written again under its own id;
   * once the server has the delete (or is receiving it) the data comes back as a new record, so
   * nothing the outbox holds is ever rewritten. Returns the live record.
   */
  async restore(
    type: RecordType,
    id: string,
    householdId: string,
    data: Record<string, unknown>,
  ): Promise<LocalRecord> {
    const { db, clock, actorId } = this.deps;
    const now = clock.now().toISOString();
    const outcome = await db.transaction('rw', [db.records(type), db.outbox], async () => {
      const current = await db.records(type).get(id);
      if (!current) return { kind: 'create' as const, id };
      const entries = await entriesFor(db, type, id);
      const last = entries.at(-1);
      if (current.deletedAt !== null && last?.op === 'delete' && last.sending !== true) {
        if (last.seq !== undefined) await db.outbox.delete(last.seq);
        const live: LocalRecord = {
          ...current,
          deletedAt: null,
          updatedAt: now,
          updatedBy: actorId,
          _pending: entries.length > 1,
        };
        await db.records(type).put(live);
        return { kind: 'live' as const, record: live };
      }
      return { kind: 'create' as const, id: this.deps.ids.next() };
    });
    if (outcome.kind === 'live') {
      this.deps.onWrite?.([type]);
      return outcome.record;
    }
    return this.create(type, householdId, data, outcome.id);
  }

  private async dropWithPet(row: LocalRecord, petNeverSent: boolean, now: string): Promise<void> {
    const { db } = this.deps;
    if (petNeverSent) {
      await db.outbox.where('[type+id]').equals([row.type, row.id]).delete();
      await db.records(row.type).delete(row.id);
    } else if (row.deletedAt === null) {
      await db.records(row.type).put({ ...row, deletedAt: now });
    }
  }
}
