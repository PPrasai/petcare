import { getEntity, instantToLocalDate, localToInstant, toMinor } from '@petcare/domain';
import type { Preferences, QuantityUnit } from '@petcare/domain';
import { toStored } from '../lib/format';
import { buildActivity } from './activity';
import type { ActivityEntry } from './activity';
import type { DocumentService } from './document-service';
import type { ExpenseService } from './expense-service';
import { addDays } from './health-logic';
import type { HealthService } from './health-service';
import { matchMedicationTask } from './medication-match';
import type { MeasurementService } from './measurement-service';
import { InvalidInput } from './pet-service';
import type { FileGateway } from './ports/file-gateway';
import type { ImageReducer } from './ports/image-reducer';
import type { NewRecord, RecordStore, StoredRecord } from './ports/record-store';
import type { TodayItem } from './today';
import type { TodayService } from './today-service';

/** The Log sheet's nine kinds, in the order of the mock (SPEC-petcare-002 slices P1 and P7). */
export const LOG_KINDS = [
  'meal',
  'walk',
  'medication',
  'grooming',
  'weight',
  'note',
  'expense',
  'vet',
  'photo',
] as const;
export type LogKind = (typeof LOG_KINDS)[number];

/** The walk lengths offered as one-tap chips. */
export const WALK_MINUTES = [15, 30, 45, 60] as const;
/** The grooming tasks offered; the contract also allows `other`. */
export const GROOMING_TASKS = ['bath', 'brushing', 'nailTrim', 'haircut', 'teeth', 'ears'] as const;
export type GroomingTask = (typeof GROOMING_TASKS)[number];
/** "Remind me again" choices, in days. */
export const AGAIN_DAYS = [1, 7, 14, 30, 90] as const;
/** How many presets the meal form shows: the most recently updated ones. */
export const PRESETS_SHOWN = 4;
export const QUANTITY_CHOICES: readonly QuantityUnit[] = [
  'g',
  'kg',
  'oz',
  'lb',
  'cup',
  'can',
  'pouch',
  'tbsp',
];

/** The expense categories offered as chips on the sheet; the Expenses page has all nine. */
export const LOG_EXPENSE_CATEGORIES = ['food', 'vet', 'grooming', 'insurance'] as const;
/** The other five, behind the "More" chip, so no category is lost (PO-petcare-002 Q-12). */
export const LOG_EXPENSE_MORE = [
  'supplies',
  'medication',
  'boarding',
  'training',
  'other',
] as const;

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
    private readonly reducer: ImageReducer,
    private readonly records: RecordStore,
    private readonly today: TodayService,
  ) {}

  /** A pet's meal presets, most recently updated first (all of them; the form shows four). */
  async presets(householdId: string, petId: string): Promise<StoredRecord[]> {
    const rows = await this.records.list('mealPreset', householdId);
    return rows
      .filter((r) => r.deletedAt === null && r.data.petId === petId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
  }

  /** Recent activity (care logs, completions, notes) of one pet, newest first. */
  async activity(householdId: string, petId: string): Promise<ActivityEntry[]> {
    const types = [
      'careLog',
      'symptomEntry',
      'careCompletion',
      'careRoutine',
      'reminderCompletion',
      'reminder',
      'medicationDose',
      'medication',
    ] as const;
    const all = (
      await Promise.all(types.map((type) => this.records.list(type, householdId)))
    ).flat();
    return buildActivity(all, petId);
  }

  removePreset(id: string): Promise<void> {
    return this.records.remove('mealPreset', id);
  }

  /**
   * A meal with an optional quantity and time. With `savePreset`, a quantity and no identical
   * preset yet, the meal is also remembered as a preset (both written together).
   */
  async meal(
    householdId: string,
    input: {
      petId: string;
      food: string;
      quantity: string;
      unit: QuantityUnit;
      /** HH:MM, or empty for now. */
      time: string;
      savePreset: boolean;
    },
    prefs: Pick<Preferences, 'timeZone'>,
    now: Date,
  ): Promise<StoredRecord[]> {
    const food = input.food.trim();
    if (food === '') throw new InvalidInput('foodName');
    const raw = input.quantity.trim();
    const quantity = raw === '' ? undefined : Number(raw.replace(',', '.'));
    if (quantity !== undefined && !(Number.isFinite(quantity) && quantity > 0)) {
      throw new InvalidInput('quantity');
    }
    const items: NewRecord[] = [
      {
        type: 'careLog',
        data: {
          kind: 'meal',
          petId: input.petId,
          occurredAt: this.occurredAt(input.time, prefs.timeZone, now),
          foodName: food,
          ...(quantity === undefined ? {} : { quantity, quantityUnit: input.unit }),
        },
      },
    ];
    if (input.savePreset && quantity !== undefined) {
      const same = (await this.presets(householdId, input.petId)).some(
        (p) =>
          p.data.foodName === food &&
          p.data.quantity === quantity &&
          p.data.quantityUnit === input.unit,
      );
      if (!same) {
        items.push({
          type: 'mealPreset',
          data: { petId: input.petId, foodName: food, quantity, quantityUnit: input.unit },
        });
      }
    }
    return this.write(householdId, items);
  }

  /** One tap on a preset logs that meal now. */
  mealFromPreset(householdId: string, preset: StoredRecord, now: Date): Promise<StoredRecord[]> {
    const d = preset.data;
    return this.write(householdId, [
      {
        type: 'careLog',
        data: {
          kind: 'meal',
          petId: d.petId,
          occurredAt: now.toISOString(),
          foodName: d.foodName,
          quantity: d.quantity,
          quantityUnit: d.quantityUnit,
        },
      },
    ]);
  }

  walk(householdId: string, petId: string, minutes: number, now: Date): Promise<StoredRecord[]> {
    return this.write(householdId, [
      {
        type: 'careLog',
        data: { kind: 'walk', petId, occurredAt: now.toISOString(), durationMin: minutes },
      },
    ]);
  }

  /** Grooming with one or more tasks, a note and an optional "remind me again". */
  async grooming(
    householdId: string,
    input: {
      petId: string;
      tasks: GroomingTask[];
      note: string;
      againDays: number | null;
      /** The reminder's title (the app's language is the UI's business). */
      reminderTitle: string;
    },
    prefs: Pick<Preferences, 'timeZone'>,
    now: Date,
  ): Promise<StoredRecord[]> {
    if (input.tasks.length === 0) throw new InvalidInput('groomingTasks');
    const note = input.note.trim();
    return this.write(householdId, [
      {
        type: 'careLog',
        data: {
          kind: 'grooming',
          petId: input.petId,
          occurredAt: now.toISOString(),
          groomingTasks: input.tasks,
          ...(note ? { note } : {}),
        },
      },
      ...this.again(input.petId, input.reminderTitle, 'grooming', input.againDays, '', prefs, now),
    ]);
  }

  /**
   * A medication given. If it matches an open dose of the pet's medication (ADR-14), the dose is
   * checked off in the same transaction; `matched` is that task, for the toast. Undo is `undo()`
   * on the returned records.
   */
  async medication(
    householdId: string,
    input: {
      petId: string;
      name: string;
      /** The current medication picked by its chip. */
      medicationId?: string;
      route: 'oral' | 'topical';
      dose: string;
      /** HH:MM, or empty for now. */
      time: string;
      againDays: number | null;
      reminderTitle: string;
    },
    ctx: { userId: string; prefs: Pick<Preferences, 'timeZone'> },
    now: Date,
  ): Promise<{ records: StoredRecord[]; matched: TodayItem | null }> {
    const name = input.name.trim();
    if (name === '') throw new InvalidInput('medicationName');
    const tz = ctx.prefs.timeZone;
    const view = await this.today.view(householdId, {
      now,
      tz,
      userId: ctx.userId,
      petId: input.petId,
    });
    const matched = matchMedicationTask(
      name,
      input.petId,
      [...view.overdue, ...view.today],
      input.medicationId,
    );
    const medicationId = matched?.sourceId ?? input.medicationId;
    const dose = input.dose.trim();
    const items: NewRecord[] = [
      {
        type: 'careLog',
        data: {
          kind: 'medication',
          petId: input.petId,
          occurredAt: this.occurredAt(input.time, tz, now),
          medicationName: name,
          ...(medicationId ? { medicationId } : {}),
          route: input.route,
          ...(dose ? { doseText: dose } : {}),
        },
      },
    ];
    if (matched) {
      items.push({
        type: 'medicationDose',
        data: {
          medicationId: matched.sourceId,
          petId: input.petId,
          occurrenceAt: matched.occurrenceAt,
          givenAt: now.toISOString(),
          skipped: false,
        },
      });
    }
    items.push(
      ...this.again(
        input.petId,
        input.reminderTitle,
        'medication',
        input.againDays,
        input.time,
        ctx.prefs,
        now,
      ),
    );
    return { records: await this.write(householdId, items), matched };
  }

  /** Takes back what a log wrote (the Undo toast): every record is deleted. */
  async undo(records: StoredRecord[]): Promise<void> {
    for (const r of records) await this.records.remove(r.type, r.id);
  }

  /** A `once` reminder N days on, at the logged time or 09:00, born at `now` (AS-002 4.2). */
  private again(
    petId: string,
    title: string,
    category: 'grooming' | 'medication',
    days: number | null,
    time: string,
    prefs: Pick<Preferences, 'timeZone'>,
    now: Date,
  ): NewRecord[] {
    if (days === null) return [];
    return [
      {
        type: 'reminder',
        data: {
          petId,
          title,
          active: true,
          category,
          schedule: {
            tz: prefs.timeZone,
            kind: 'once',
            startOn: addDays(instantToLocalDate(now.getTime(), prefs.timeZone), days),
            times: [time || '09:00'],
            notBefore: now.toISOString(),
          },
        },
      },
    ];
  }

  private occurredAt(time: string, tz: string, now: Date): string {
    if (!time) return now.toISOString();
    return localToInstant(instantToLocalDate(now.getTime(), tz), time, tz).toISOString();
  }

  /** Validates every record with its entity schema, then writes them all or none. */
  private write(householdId: string, items: NewRecord[]): Promise<StoredRecord[]> {
    for (const item of items) {
      const parsed = getEntity(item.type).schema.safeParse(item.data);
      if (!parsed.success) throw new InvalidInput(parsed.error.issues[0]?.path.join('.') ?? '');
    }
    return this.records.createMany(householdId, items);
  }

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

  /**
   * Reduces the photo like a pet photo (QA-35: long edge 768 px, no EXIF), keeps it on the device
   * (uploaded by the next sync) and files it under the pet. Throws `PhotoUnusable` for a file
   * that cannot be decoded; nothing is written then.
   */
  async photo(householdId: string, petId: string, file: File) {
    const reduced = await this.reducer.reduce(file);
    const { fileId } = await this.files.attach(
      householdId,
      new File([reduced], 'photo.jpg', { type: reduced.type || 'image/jpeg' }),
    );
    await this.documents.add(householdId, {
      petId,
      title: file.name || 'photo',
      category: 'photo',
      fileId,
    });
  }
}
