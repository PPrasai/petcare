import { instantToLocalDate, toMinor } from '@petcare/domain';
import type { Preferences } from '@petcare/domain';
import { toStored } from '../lib/format';
import type { DocumentService } from './document-service';
import type { ExpenseService } from './expense-service';
import type { HealthService } from './health-service';
import type { MeasurementService } from './measurement-service';
import { InvalidInput } from './pet-service';
import type { FileGateway } from './ports/file-gateway';

/** The Log sheet's kinds that write the existing record types (SPEC-petcare-002 slice P1). */
export const LOG_KINDS = ['weight', 'note', 'expense', 'vet', 'photo'] as const;
export type LogKind = (typeof LOG_KINDS)[number];

/** The expense categories offered as chips on the sheet; the Expenses page has all nine. */
export const LOG_EXPENSE_CATEGORIES = ['food', 'vet', 'grooming', 'insurance'] as const;

type LogPrefs = Pick<
  Preferences,
  'weightUnit' | 'lengthUnit' | 'temperatureUnit' | 'timeZone' | 'currency'
>;

/** One-step logging for the Log sheet. It writes the same records as the full forms do. */
export class LogService {
  constructor(
    private readonly measurements: MeasurementService,
    private readonly health: HealthService,
    private readonly expenses: ExpenseService,
    private readonly documents: DocumentService,
    private readonly files: FileGateway,
  ) {}

  /** A weight as the user's unit shows it ("12.5" in kg or lb). Stored in kg. */
  async weight(householdId: string, petId: string, shown: number, prefs: LogPrefs, now: Date) {
    if (!Number.isFinite(shown) || shown <= 0) throw new InvalidInput('value');
    await this.measurements.add(householdId, {
      petId,
      kind: 'weight',
      value: toStored('weight', shown, prefs),
      measuredAt: now.toISOString(),
    });
  }

  async note(householdId: string, petId: string, description: string, now: Date) {
    const text = description.trim();
    if (text === '') throw new InvalidInput('description');
    await this.health.add('symptomEntry', householdId, {
      petId,
      observedAt: now.toISOString(),
      description: text,
    });
  }

  async expense(
    householdId: string,
    petId: string,
    amount: string,
    category: string,
    prefs: LogPrefs,
    now: Date,
  ) {
    await this.expenses.add(householdId, {
      petId,
      spentOn: instantToLocalDate(now.getTime(), prefs.timeZone),
      category,
      amount,
      currency: prefs.currency,
      note: '',
      fileId: '',
    });
  }

  async vetVisit(
    householdId: string,
    petId: string,
    reason: string,
    cost: string,
    prefs: LogPrefs,
    now: Date,
  ) {
    const text = reason.trim();
    if (text === '') throw new InvalidInput('reason');
    const amount = cost.trim() === '' ? undefined : Number(cost.replace(',', '.'));
    if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
      throw new InvalidInput('cost');
    }
    await this.health.add('vetVisit', householdId, {
      petId,
      visitedOn: instantToLocalDate(now.getTime(), prefs.timeZone),
      reason: text,
      ...(amount === undefined
        ? {}
        : { costMinor: toMinor(amount, prefs.currency), currency: prefs.currency }),
    });
  }

  /** Keeps the photo on the device (uploaded by the next sync) and files it under the pet. */
  async photo(householdId: string, petId: string, file: File) {
    const { fileId } = await this.files.attach(householdId, file);
    await this.documents.add(householdId, {
      petId,
      title: file.name || 'photo',
      category: 'photo',
      fileId,
    });
  }
}
