import { dueAtNineLocal, instantToLocalDate } from '@petcare/domain';
import type { RecordType } from '@petcare/domain';
import { addDays } from './health-logic';
import type { RecordStore, StoredRecord } from './ports/record-store';
import { buildToday } from './today';
import type { TodayItem, TodayView } from './today';

const SOURCE_TYPES: RecordType[] = [
  'pet',
  'vaccination',
  'vetVisit',
  'medication',
  'medicationDose',
  'careRoutine',
  'careCompletion',
  'reminder',
  'reminderCompletion',
  'reminderSnooze',
];

export type SnoozeFor = 'hour' | 'tomorrow';

/** Today page use cases: what is due, marking items done or skipped, and snoozing. */
export class TodayService {
  constructor(private readonly records: RecordStore) {}

  async view(
    householdId: string,
    opts: { now: Date; tz: string; userId: string; petId: string | null; horizonDays?: number },
  ): Promise<TodayView> {
    const all = (
      await Promise.all(SOURCE_TYPES.map((type) => this.records.list(type, householdId)))
    ).flat();
    return buildToday(all, opts);
  }

  /** Marks one occurrence done (or skipped). Vaccinations and visits are not completed here. */
  async complete(
    householdId: string,
    item: TodayItem,
    skipped: boolean,
    now: Date,
  ): Promise<StoredRecord> {
    const stamp = { occurrenceAt: item.occurrenceAt, completedAt: now.toISOString() };
    switch (item.sourceType) {
      case 'medication':
        return this.records.create('medicationDose', householdId, {
          medicationId: item.sourceId,
          petId: item.petId,
          occurrenceAt: item.occurrenceAt,
          givenAt: stamp.completedAt,
          skipped,
        });
      case 'careRoutine':
        return this.records.create('careCompletion', householdId, {
          routineId: item.sourceId,
          petId: item.petId,
          ...stamp,
          skipped,
        });
      case 'reminder':
        return this.records.create('reminderCompletion', householdId, {
          reminderId: item.sourceId,
          ...stamp,
        });
      default:
        throw new Error(`cannot complete a ${item.sourceType}`);
    }
  }

  /** Takes back a completion made a moment ago (the Undo toast): the record is deleted. */
  undo(completion: StoredRecord): Promise<void> {
    return this.records.remove(completion.type, completion.id);
  }

  /** Hides one occurrence for this user until `until` ("hour" or tomorrow 09:00 local). */
  snooze(
    householdId: string,
    userId: string,
    item: TodayItem,
    until: SnoozeFor,
    now: Date,
    tz: string,
  ): Promise<StoredRecord> {
    const snoozedUntil =
      until === 'hour'
        ? new Date(now.getTime() + 3_600_000).toISOString()
        : dueAtNineLocal(addDays(instantToLocalDate(now.getTime(), tz), 1), tz);
    return this.records.create('reminderSnooze', householdId, {
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      occurrenceAt: item.occurrenceAt,
      snoozedUntil,
      userId,
    });
  }
}
