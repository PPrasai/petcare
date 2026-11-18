import type { RecordStore, StoredRecord } from './ports/record-store';
import { InvalidInput } from './pet-service';
import { checkRecord, updateRecord, withoutEmptyValues } from './record-checks';

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

  /** Renames or re-files a document; the file itself stays. */
  async update(id: string, change: { title: string; category: string }): Promise<StoredRecord> {
    const current = await this.records.get('document', id);
    if (!current) throw new InvalidInput('id');
    return updateRecord(this.records, 'document', id, { ...current.data, ...change });
  }

  remove(id: string): Promise<void> {
    return this.records.remove('document', id);
  }
}
