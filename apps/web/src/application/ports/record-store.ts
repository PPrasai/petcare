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

/** Local-first record access: reads come from the device, writes are queued for sync. */
export interface RecordStore {
  list(type: RecordType, householdId: string): Promise<StoredRecord[]>;
  get(type: RecordType, id: string): Promise<StoredRecord | undefined>;
  create(
    type: RecordType,
    householdId: string,
    data: Record<string, unknown>,
  ): Promise<StoredRecord>;
  update(type: RecordType, id: string, fields: Record<string, unknown>): Promise<StoredRecord>;
  remove(type: RecordType, id: string): Promise<void>;
}
