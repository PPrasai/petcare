import { dueOccurrences } from '@petcare/domain';
import type { RecordEnvelope, RecordType, SourceType } from '@petcare/domain';
import { toEnvelope } from '../repositories';
import type { Repositories, UnitOfWork } from '../repositories';

/** How far ahead notifications are scheduled (AS 4.5). */
export const DERIVE_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export const SOURCE_TYPES: SourceType[] = [
  'vaccination',
  'medication',
  'careRoutine',
  'reminder',
  'vetVisit',
];

const isSource = (type: string): type is SourceType => SOURCE_TYPES.includes(type as SourceType);

/** The source whose notifications a changed record affects, or null. */
export function sourceOf(record: RecordEnvelope): { type: SourceType; id: string } | null {
  const d = record.data;
  if (isSource(record.type)) return { type: record.type, id: record.id };
  switch (record.type) {
    case 'medicationDose':
      return { type: 'medication', id: String(d.medicationId) };
    case 'careCompletion':
      return { type: 'careRoutine', id: String(d.routineId) };
    case 'reminderCompletion':
      return { type: 'reminder', id: String(d.reminderId) };
    case 'reminderSnooze':
      return isSource(String(d.sourceType))
        ? { type: d.sourceType as SourceType, id: String(d.sourceId) }
        : null;
    default:
      return null;
  }
}

function textFor(source: RecordEnvelope, petName: string | null): { title: string; body: string } {
  const d = source.data;
  const body = petName ?? 'PetCare';
  switch (source.type) {
    case 'vaccination':
      return { title: `Vaccination due: ${String(d.vaccineName)}`, body };
    case 'medication':
      return { title: `Medication: ${String(d.name)}`, body };
    case 'vetVisit':
      return { title: 'Vet follow-up', body: d.reason ? `${body} · ${String(d.reason)}` : body };
    default:
      return { title: String(d.title), body };
  }
}

/**
 * Brings the scheduled notifications of one source up to date: one row per opted-in household
 * member and upcoming occurrence in the next 30 days, at `fireAt = occurrence - lead time`.
 * Occurrences already answered (done or skipped) get no row; a snooze moves a row's `fireAt`.
 * Rows that are no longer wanted (edited schedule, deleted or paused source) and not yet sent
 * are removed. Idempotent by the dedupe key (user, source type, source, occurrence).
 */
export async function deriveSource(
  repos: Repositories,
  sourceType: SourceType,
  sourceId: string,
  now: Date,
  newId: () => string,
): Promise<void> {
  const found = await repos.records.find(sourceType as RecordType, sourceId);
  const source = found ? toEnvelope(sourceType as RecordType, found) : null;
  const live = source !== null && source.deletedAt === null && source.data.active !== false;

  const wanted: Parameters<Repositories['notifications']['upsertScheduled']>[0] = [];
  if (live && source) {
    const petId = typeof source.data.petId === 'string' ? source.data.petId : null;
    const pet = petId ? await repos.records.find('pet', petId) : null;
    const petName = pet ? String(toEnvelope('pet', pet).data.name) : null;
    const { title, body } = textFor(source, petName);
    const members = await repos.households.listMembers(source.householdId);
    for (const member of members) {
      const prefs = await repos.preferences.get(member.userId);
      if (!prefs.pushEnabled || !prefs.pushTypes.includes(sourceType)) continue;
      const leadMs = prefs.leadMinutes[sourceType] * 60_000;
      const window = {
        from: now,
        to: new Date(now.getTime() + DERIVE_WINDOW_DAYS * DAY_MS + leadMs),
      };
      for (const occurrence of dueOccurrences([source], window, prefs.timeZone, member.userId)) {
        const occurrenceAt = new Date(occurrence.occurrenceAt);
        if (await repos.notifications.isCompleted(sourceType, sourceId, occurrenceAt)) continue;
        let fireAt = new Date(occurrenceAt.getTime() - leadMs);
        const snoozed = await repos.notifications.snoozedUntil(
          member.userId,
          sourceType,
          sourceId,
          occurrenceAt,
        );
        if (snoozed && snoozed > fireAt) fireAt = snoozed;
        wanted.push({
          id: newId(),
          householdId: source.householdId,
          userId: member.userId,
          sourceType,
          sourceId,
          occurrenceAt,
          fireAt,
          title,
          body,
        });
      }
    }
  }

  await repos.notifications.upsertScheduled(wanted);
  const keep = new Set(wanted.map((w) => `${w.userId}|${w.occurrenceAt.getTime()}`));
  const stale = (await repos.notifications.unsentForSource(sourceType, sourceId)).filter(
    (row) => !keep.has(`${row.userId}|${row.occurrenceAt.getTime()}`),
  );
  await repos.notifications.deleteScheduled(stale.map((r) => r.id));
}

/** The sync service hook: re-derive whatever a changed record affects, in its transaction. */
export function createNotificationDeriver(deps: { clock: () => Date; newId: () => string }) {
  return async (repos: Repositories, record: RecordEnvelope): Promise<void> => {
    const source = sourceOf(record);
    if (source) await deriveSource(repos, source.type, source.id, deps.clock(), deps.newId);
  };
}

/** The nightly job: re-derive every live source (self-heals after logic or preference changes). */
export async function extendSchedules(
  unitOfWork: UnitOfWork,
  deps: { clock: () => Date; newId: () => string },
): Promise<number> {
  let count = 0;
  for (const type of SOURCE_TYPES) {
    const rows = await unitOfWork.repositories.notifications.liveRecords(type, null);
    for (const row of rows) {
      await unitOfWork.run((repos) => deriveSource(repos, type, row.id, deps.clock(), deps.newId));
      count += 1;
    }
  }
  return count;
}
