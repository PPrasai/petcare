import { toMinor } from '@petcare/domain';
import { InvalidInput } from './pet-service';
import type { RecordStore, StoredRecord } from './ports/record-store';
import { checkRecord, updateRecord, withoutEmptyValues } from './record-checks';

export interface ExpenseForm {
  petId: string;
  spentOn: string;
  category: string;
  /** The amount as typed, in major units ("12.50"). */
  amount: string;
  currency: string;
  note: string;
  fileId: string;
}

/** Expenses: money spent on a pet or the household, with an optional receipt (CAP-13). */
export class ExpenseService {
  constructor(private readonly records: RecordStore) {}

  /** Live expenses, newest first. */
  async list(householdId: string): Promise<StoredRecord[]> {
    const rows = (await this.records.list('expense', householdId)).filter(
      (e) => e.deletedAt === null,
    );
    return rows.sort((a, b) => String(b.data.spentOn).localeCompare(String(a.data.spentOn)));
  }

  /** Converts the typed amount to minor units and validates the whole record. */
  async add(householdId: string, form: ExpenseForm): Promise<StoredRecord> {
    const data = this.dataOf(form);
    checkRecord('expense', data);
    return this.records.create('expense', householdId, data);
  }

  /** Saves an edited expense. An empty `fileId` keeps the receipt it has; a new one replaces it. */
  async update(id: string, form: ExpenseForm): Promise<StoredRecord> {
    const current = await this.records.get('expense', id);
    if (!current) throw new InvalidInput('id');
    const data = this.dataOf(form);
    if (data.fileId === undefined && current.data.fileId) data.fileId = current.data.fileId;
    return updateRecord(this.records, 'expense', id, data);
  }

  private dataOf(form: ExpenseForm): Record<string, unknown> {
    const amount = Number(form.amount.replace(',', '.'));
    if (form.amount.trim() === '' || !Number.isFinite(amount) || amount < 0) {
      throw new InvalidInput('amount');
    }
    const currency = form.currency.trim().toUpperCase();
    let amountMinor: number;
    try {
      amountMinor = toMinor(amount, currency);
    } catch {
      throw new InvalidInput('currency');
    }
    return withoutEmptyValues({
      petId: form.petId,
      spentOn: form.spentOn,
      category: form.category,
      amountMinor,
      currency,
      note: form.note,
      fileId: form.fileId,
    });
  }

  remove(id: string): Promise<void> {
    return this.records.remove('expense', id);
  }
}
