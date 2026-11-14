import { OVERDUE_LIST_DAYS } from './constants';
import type { RecordEnvelope } from './envelope';
import { dueAtNineLocal, occurrencesBetween } from './recurrence';
import type { Schedule } from './schemas';

export type SourceType = 'vaccination' | 'medication' | 'careRoutine' | 'reminder' | 'vetVisit';

/** One thing that is due at one instant. */
export interface Occurrence {
  sourceType: SourceType;
  sourceId: string;
  petId: string | null;
  occurrenceAt: string;
}

export type OccurrenceStatus = 'done' | 'snoozed' | 'overdue' | 'upcoming';

const alive = (r: RecordEnvelope): boolean => r.deletedAt === null;
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const key = (type: string, id: string, at: string): string => `${type}:${id}:${Date.parse(at)}`;
const normalName = (name: unknown): string =>
  String(name ?? '')
    .trim()
    .toLowerCase();

/**
 * Every occurrence of every due source between `from` and `to`.
 * Vaccinations: one occurrence at nextDueOn 09:00 in the user's time zone, unless a later
 * vaccination of the same pet has the same name (case-insensitive).
 * Inactive routines and reminders produce nothing.
 */
export function dueOccurrences(
  records: RecordEnvelope[],
  window: { from: Date | string; to: Date | string },
  userTz: string,
  /** When given, a reminder whose audienceUserId names someone else is left out (CON-003 2.6). */
  forUserId?: string,
): Occurrence[] {
  const live = records.filter(alive);
  const result: Occurrence[] = [];
  const inWindow = (at: string): boolean =>
    Date.parse(at) >= new Date(window.from).getTime() &&
    Date.parse(at) <= new Date(window.to).getTime();

  const push = (sourceType: SourceType, r: RecordEnvelope, at: string): void => {
    result.push({ sourceType, sourceId: r.id, petId: str(r.data.petId), occurrenceAt: at });
  };

  const vaccinations = live.filter((r) => r.type === 'vaccination');
  for (const v of vaccinations) {
    const nextDueOn = str(v.data.nextDueOn);
    if (!nextDueOn) continue;
    const givenOn = str(v.data.givenOn) ?? '';
    const superseded = vaccinations.some(
      (o) =>
        o.id !== v.id &&
        o.data.petId === v.data.petId &&
        normalName(o.data.vaccineName) === normalName(v.data.vaccineName) &&
        (str(o.data.givenOn) ?? '') > givenOn,
    );
    const at = dueAtNineLocal(nextDueOn, userTz);
    if (!superseded && inWindow(at)) push('vaccination', v, at);
  }

  for (const visit of live.filter((r) => r.type === 'vetVisit')) {
    const followUpOn = str(visit.data.followUpOn);
    const at = followUpOn ? dueAtNineLocal(followUpOn, userTz) : '';
    if (at && inWindow(at)) push('vetVisit', visit, at);
  }

  for (const type of ['medication', 'careRoutine', 'reminder'] as const) {
    for (const r of live.filter((x) => x.type === type && x.data.active !== false)) {
      if (type === 'reminder' && forUserId !== undefined) {
        const audience = r.data.audienceUserId;
        if (typeof audience === 'string' && audience !== forUserId) continue;
      }
      for (const at of occurrencesBetween(r.data.schedule as Schedule, window.from, window.to)) {
        push(type, r, at);
      }
    }
  }
  return result.sort((a, b) => a.occurrenceAt.localeCompare(b.occurrenceAt));
}

/** The completion/dose record's source and occurrence, or null for other types. */
export function completionOf(
  r: RecordEnvelope,
): { sourceType: SourceType; sourceId: string; occurrenceAt: string } | null {
  const occurrenceAt = str(r.data.occurrenceAt);
  if (!occurrenceAt) return null;
  const map: Record<string, [SourceType, string]> = {
    medicationDose: ['medication', 'medicationId'],
    careCompletion: ['careRoutine', 'routineId'],
    reminderCompletion: ['reminder', 'reminderId'],
  };
  const entry = map[r.type];
  if (!entry) return null;
  const sourceId = str(r.data[entry[1]]);
  return sourceId ? { sourceType: entry[0], sourceId, occurrenceAt } : null;
}

/** Latest snoozedUntil per occurrence for one user. */
export function snoozeMap(records: RecordEnvelope[], userId: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of records.filter(alive)) {
    if (r.type !== 'reminderSnooze' || r.data.userId !== userId) continue;
    const until = Date.parse(String(r.data.snoozedUntil));
    const k = key(String(r.data.sourceType), String(r.data.sourceId), String(r.data.occurrenceAt));
    map.set(k, Math.max(map.get(k) ?? 0, until));
  }
  return map;
}

/** The set of occurrences that have a non-deleted dose or completion (skips included). */
export function doneSet(records: RecordEnvelope[]): Set<string> {
  const done = new Set<string>();
  for (const r of records.filter(alive)) {
    const c = completionOf(r);
    if (c) done.add(key(c.sourceType, c.sourceId, c.occurrenceAt));
  }
  return done;
}

export function occurrenceStatus(
  occurrence: Occurrence,
  now: Date | string,
  done: Set<string>,
  snoozes: Map<string, number>,
): OccurrenceStatus {
  const k = key(occurrence.sourceType, occurrence.sourceId, occurrence.occurrenceAt);
  const nowMs = new Date(now).getTime();
  if (done.has(k)) return 'done';
  if ((snoozes.get(k) ?? 0) > nowMs) return 'snoozed';
  return Date.parse(occurrence.occurrenceAt) < nowMs ? 'overdue' : 'upcoming';
}

/** Overdue items stay listed until done, for up to OVERDUE_LIST_DAYS. */
export function overdueWindowStart(now: Date | string): Date {
  return new Date(new Date(now).getTime() - OVERDUE_LIST_DAYS * 86_400_000);
}

/**
 * The missed daily/weekly rule (CON-003 2.6, PO-002 Q-03): an overdue occurrence of a daily or
 * weekly schedule stops being listed once the next occurrence of the same source has started.
 * Other kinds keep the overdue window. It changes only what is listed, never a record.
 * Used by the in-app list from slice P8 (application/today.ts).
 */
export function applyMissedRule(
  occurrences: Occurrence[],
  records: RecordEnvelope[],
  now: Date | string,
  statusOf: (o: Occurrence) => OccurrenceStatus,
): Occurrence[] {
  const nowMs = new Date(now).getTime();
  const schedules = new Map<string, Schedule>();
  for (const r of records.filter(alive)) {
    if (r.type === 'medication' || r.type === 'careRoutine' || r.type === 'reminder') {
      schedules.set(`${r.type}:${r.id}`, r.data.schedule as Schedule);
    }
  }
  return occurrences.filter((o) => {
    if (statusOf(o) !== 'overdue') return true;
    const schedule = schedules.get(`${o.sourceType}:${o.sourceId}`);
    if (!schedule || (schedule.kind !== 'daily' && schedule.kind !== 'weekly')) return true;
    const after = Date.parse(o.occurrenceAt) + 1000;
    // A weekly schedule's next occurrence is at most 7 days (plus a DST hour) away.
    const [next] = occurrencesBetween(schedule, new Date(after), new Date(after + 8 * 86_400_000));
    return next === undefined || Date.parse(next) > nowMs;
  });
}
