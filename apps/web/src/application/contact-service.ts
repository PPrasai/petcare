import type { RecordStore, StoredRecord } from './ports/record-store';
import { checkRecord, updateRecord, withoutEmptyValues } from './record-checks';

export interface ContactForm {
  name: string;
  role: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  note: string;
}

/** Contacts: vets, clinics, groomers and other people the household calls (CAP-15). */
export class ContactService {
  constructor(private readonly records: RecordStore) {}

  /** Live contacts, alphabetical. */
  async list(householdId: string): Promise<StoredRecord[]> {
    const rows = (await this.records.list('contact', householdId)).filter(
      (c) => c.deletedAt === null,
    );
    return rows.sort((a, b) => String(a.data.name).localeCompare(String(b.data.name)));
  }

  async add(householdId: string, form: ContactForm): Promise<StoredRecord> {
    const data = withoutEmptyValues({ ...form });
    checkRecord('contact', data);
    return this.records.create('contact', householdId, data);
  }

  /** Saves an edited contact; a field emptied in the form is cleared. */
  update(id: string, form: ContactForm): Promise<StoredRecord> {
    return updateRecord(this.records, 'contact', id, withoutEmptyValues({ ...form }));
  }

  remove(id: string): Promise<void> {
    return this.records.remove('contact', id);
  }
}
