import type { RecordStore, StoredRecord } from './ports/record-store';
import { checkRecord, withoutEmptyValues } from './record-checks';

export interface NewDocument {
  petId: string | null;
  title: string;
  category: string;
  fileId: string;
}

/** Documents: a titled, categorised file, optionally tied to a pet (CAP-12). */
export class DocumentService {
  constructor(private readonly records: RecordStore) {}

  /** Live documents, newest first; with `petId`, only that pet's. */
  async list(householdId: string, petId?: string): Promise<StoredRecord[]> {
    const rows = (await this.records.list('document', householdId)).filter(
      (d) => d.deletedAt === null && (petId === undefined || d.data.petId === petId),
    );
    return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async add(householdId: string, input: NewDocument): Promise<StoredRecord> {
    const data = withoutEmptyValues({ ...input });
    checkRecord('document', data);
    return this.records.create('document', householdId, data);
  }

  remove(id: string): Promise<void> {
    return this.records.remove('document', id);
  }
}
