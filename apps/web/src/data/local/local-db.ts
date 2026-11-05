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

export interface MetaRow {
  key: string;
  value: unknown;
}

export const dbNameFor = (userId: string): string => `petcare-u-${userId}`;

/** Per-user IndexedDB. One table per record type, built from the domain registry. */
export class LocalDb extends Dexie {
  outbox!: Table<OutboxEntry, number>;
  households!: Table<HouseholdRow, string>;
  conflicts!: Table<ConflictItem, string>;
  problems!: Table<SyncProblem, number>;
  meta!: Table<MetaRow, string>;

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
    for (const entity of entities) {
      const indexed = entity.indexes.map((field) => `data.${field}`);
      stores[entity.type] = ['id', 'householdId', 'deletedAt', ...indexed].join(', ');
    }
    this.version(1).stores(stores);
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
