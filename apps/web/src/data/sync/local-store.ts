import { entities } from '@petcare/domain';
import type { RecordType } from '@petcare/domain';
import type { Clock, IdGenerator } from '../../application/ports/runtime';
import type { LocalDb, LocalRecord } from '../local/local-db';
import { enqueue } from './outbox';

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
