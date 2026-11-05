import { getEntity } from '@petcare/domain';
import type { RecordType } from '@petcare/domain';
import { InvalidInput } from './pet-service';
import type { RecordStore, StoredRecord } from './ports/record-store';

export type HealthType =
  | 'vaccination'
  | 'medication'
  | 'medicationDose'
  | 'vetVisit'
  | 'condition'
  | 'symptomEntry'
  | 'careRoutine'
  | 'reminder';

/** The field each type is shown in order of (newest first). */
const ORDER_FIELD: Record<HealthType, string> = {
  vaccination: 'givenOn',
  medication: 'name',
  medicationDose: 'occurrenceAt',
  vetVisit: 'visitedOn',
  condition: 'name',
  symptomEntry: 'observedAt',
  careRoutine: 'title',
  reminder: 'title',
};

const isEmpty = (v: unknown): boolean => v === undefined || v === null || v === '';

/** Use cases for a pet's health records: vaccinations, medications and doses, visits, conditions, symptoms. */
export class HealthService {
  constructor(private readonly records: RecordStore) {}

  /** A pet's records of one type; dated types newest first, named types alphabetical. */
  async list(type: HealthType, householdId: string, petId: string): Promise<StoredRecord[]> {
    const rows = (await this.records.list(type, householdId)).filter(
      (r) => r.deletedAt === null && r.data.petId === petId,
    );
    const field = ORDER_FIELD[type];
    const sign = field === 'name' || field === 'title' ? 1 : -1;
    return rows.sort(
      (a, b) => sign * String(a.data[field] ?? '').localeCompare(String(b.data[field] ?? '')),
    );
  }

  /** Every live record of one type in the household (for example reminders not tied to a pet). */
  async all(type: HealthType, householdId: string): Promise<StoredRecord[]> {
    const rows = (await this.records.list(type, householdId)).filter((r) => r.deletedAt === null);
    return rows.sort((a, b) =>
      String(a.data.title ?? '').localeCompare(String(b.data.title ?? '')),
    );
  }

  /** Creates a record; empty values are left out. Throws InvalidInput naming the bad field. */
  async add(
    type: HealthType,
    householdId: string,
    input: Record<string, unknown>,
  ): Promise<StoredRecord> {
    const data = Object.fromEntries(Object.entries(input).filter(([, v]) => !isEmpty(v)));
    this.check(type, data);
    return this.records.create(type, householdId, data);
  }

  /** Changes fields of a record; null clears one. The result is validated whole. */
  async update(
    type: HealthType,
    id: string,
    fields: Record<string, unknown>,
  ): Promise<StoredRecord> {
    const current = await this.records.get(type, id);
    if (!current) throw new InvalidInput('id');
    const merged = { ...current.data, ...fields };
    this.check(
      type,
      Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== null && v !== undefined)),
    );
    return this.records.update(type, id, fields);
  }

  remove(type: HealthType, id: string): Promise<void> {
    return this.records.remove(type, id);
  }

  /** Logs one scheduled dose as given (now) or skipped. */
  logDose(
    householdId: string,
    medication: StoredRecord,
    occurrenceAt: string,
    skipped: boolean,
    now: Date,
  ): Promise<StoredRecord> {
    return this.add('medicationDose', householdId, {
      medicationId: medication.id,
      petId: medication.data.petId,
      occurrenceAt,
      givenAt: now.toISOString(),
      skipped,
    });
  }

  private check(type: RecordType, data: Record<string, unknown>): void {
    const parsed = getEntity(type).schema.safeParse(data);
    if (!parsed.success) throw new InvalidInput(parsed.error.issues[0]?.path.join('.') ?? '');
  }
}
