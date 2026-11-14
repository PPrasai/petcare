import Dexie from 'dexie';
import type { Table } from 'dexie';
import { entities } from '@petcare/domain';
import type { RecordEnvelope, RecordType } from '@petcare/domain';
import type { ConflictItem, PushMutation, Role } from '../../application/ports/remote-api';

/** A record as stored on the device. `_pending` is true while an outbox entry exists for it. */
export interface LocalRecord extends RecordEnvelope {
  _pending?: boolean;
}

export interface OutboxEntry extends PushMutation {
  /** Auto-increment; FIFO order. */
  seq?: number;
  /** True while this entry is part of a request in flight: it must not be coalesced into. */
  sending?: boolean;
}

export interface HouseholdRow {
  id: string;
  name: string;
  role: Role;
}

export interface SyncProblem {
  id?: number;
  at: string;
  mutationId: string;
  type: RecordType;
  recordId: string;
  code: string;
  message: string;
}

/** A file chosen on this device that the server has not received yet. `id` is a placeholder. */
export interface PendingFile {
  id: string;
  householdId: string;
  name: string;
  mimeType: string;
  blob: Blob;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/** Record types added by Dexie version 3. */
const V3_TYPES: readonly string[] = ['careLog', 'mealPreset'];

export const dbNameFor = (userId: string): string => `petcare-u-${userId}`;

/** Per-user IndexedDB. One table per record type, built from the domain registry. */
export class LocalDb extends Dexie {
  outbox!: Table<OutboxEntry, number>;
  households!: Table<HouseholdRow, string>;
  conflicts!: Table<ConflictItem, string>;
  problems!: Table<SyncProblem, number>;
  meta!: Table<MetaRow, string>;
  pendingFiles!: Table<PendingFile, string>;

  constructor(
    readonly userId: string,
    options?: { indexedDB?: IDBFactory; IDBKeyRange?: typeof IDBKeyRange },
  ) {
    super(dbNameFor(userId), options);
    const stores: Record<string, string> = {
      outbox: '++seq, mutationId, [type+id], householdId',
      households: 'id',
      conflicts: 'id, householdId, [recordType+recordId]',
      problems: '++id',
      meta: 'key',
    };
    const withRecords = (types: readonly string[]): Record<string, string> => {
      const all = { ...stores };
      for (const entity of entities.filter((e) => types.includes(e.type))) {
        const indexed = entity.indexes.map((field) => `data.${field}`);
        all[entity.type] = ['id', 'householdId', 'deletedAt', ...indexed].join(', ');
      }
      return all;
    };
    // Versions 1 and 2 name the tables that existed then, so an existing database upgrades by
    // gaining only what version 3 adds (CON-petcare-003: careLog and mealPreset).
    const v1 = withRecords(entities.map((e) => e.type).filter((t) => !V3_TYPES.includes(t)));
    this.version(1).stores(v1);
    this.version(2).stores({ ...v1, pendingFiles: 'id, householdId' });
    this.version(3).stores({
      ...withRecords(entities.map((e) => e.type)),
      pendingFiles: 'id, householdId',
    });
  }

  records(type: RecordType): Table<LocalRecord, string> {
    return this.table(type);
  }

  /** Every table that holds records, for transactions. */
  recordTables(): Table<LocalRecord, string>[] {
    return entities.map((e) => this.records(e.type));
  }

  async wipe(): Promise<void> {
    this.close();
    await Dexie.delete(this.name);
  }
}
