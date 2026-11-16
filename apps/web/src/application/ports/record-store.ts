import type { RecordType } from '@petcare/domain';

/** A record as the application sees it. `pending` is true while it waits to be synced. */
export interface StoredRecord {
  id: string;
  type: RecordType;
  householdId: string;
  version: number;
  createdBy: string;
  updatedAt: string;
  deletedAt: string | null;
  pending: boolean;
  data: Record<string, unknown>;
}

/** One record to create with `createMany`. */
export interface NewRecord {
  /** The id to give it, when other records in the same write refer to it; else one is made. */
  id?: string;
  type: RecordType;
  data: Record<string, unknown>;
}

/** Local-first record access: reads come from the device, writes are queued for sync. */
export interface RecordStore {
  list(type: RecordType, householdId: string): Promise<StoredRecord[]>;
  get(type: RecordType, id: string): Promise<StoredRecord | undefined>;
  create(
    type: RecordType,
    householdId: string,
    data: Record<string, unknown>,
  ): Promise<StoredRecord>;
  /**
   * Creates several records in one local transaction (CON-003 2.5.2): all are written, or none.
   * Each record still gets its own outbox entry, in the order given.
   */
  createMany(householdId: string, items: NewRecord[]): Promise<StoredRecord[]>;
  update(type: RecordType, id: string, fields: Record<string, unknown>): Promise<StoredRecord>;
  remove(type: RecordType, id: string): Promise<void>;
  /**
   * Takes a delete back (Undo): the record is live again, whether its delete is still queued or
   * already sent (then its data comes back as a new record). Returns the live record.
   */
  restore(record: StoredRecord): Promise<StoredRecord>;
}
