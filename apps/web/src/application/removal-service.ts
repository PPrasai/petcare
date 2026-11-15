import type { RecordStore, StoredRecord } from './ports/record-store';

/**
 * Deleting a record and taking it back (the Undo toast). Both go through the record store, so
 * each is one local transaction with its outbox entry (offline first).
 */
export class RemovalService {
  constructor(private readonly records: RecordStore) {}

  remove(record: StoredRecord): Promise<void> {
    return this.records.remove(record.type, record.id);
  }

  async restore(record: StoredRecord): Promise<void> {
    await this.records.restore(record);
  }
}
