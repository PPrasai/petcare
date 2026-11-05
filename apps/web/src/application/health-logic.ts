import { dateFromDayNumber, dayNumber, occurrencesBetween } from '@petcare/domain';
import type { Schedule } from '@petcare/domain';
import type { StoredRecord } from './ports/record-store';

export const SOON_DAYS = 30;

export type VaccinationBadge = 'none' | 'overdue' | 'dueSoon' | 'upcoming';

export const addDays = (date: string, days: number): string =>
  dateFromDayNumber(dayNumber(date) + days);

const normal = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .toLowerCase();

/**
 * The badge for a vaccination at a glance. A vaccination whose next due date has been answered by
 * a later dose of the same vaccine (same pet, same name) shows no badge.
 */
export function vaccinationBadge(
  vaccination: StoredRecord,
  all: StoredRecord[],
  today: string,
): VaccinationBadge {
  const due = vaccination.data.nextDueOn;
  if (typeof due !== 'string' || due === '') return 'none';
  const givenOn = String(vaccination.data.givenOn ?? '');
  const superseded = all.some(
    (o) =>
      o.id !== vaccination.id &&
      o.deletedAt === null &&
      o.data.petId === vaccination.data.petId &&
      normal(o.data.vaccineName) === normal(vaccination.data.vaccineName) &&
      String(o.data.givenOn ?? '') > givenOn,
  );
  if (superseded) return 'none';
  if (due < today) return 'overdue';
  return due <= addDays(today, SOON_DAYS) ? 'dueSoon' : 'upcoming';
}

export interface DoseSlot {
  occurrenceAt: string;
  /** The logged dose for this occurrence, if any. */
  dose: StoredRecord | undefined;
}

/** Scheduled doses of one medication around `now`, each with its logged dose (given or skipped). */
export function doseSlots(
  medication: StoredRecord,
  doses: StoredRecord[],
  now: Date,
  hoursBack = 48,
  hoursAhead = 12,
): DoseSlot[] {
  const schedule = medication.data.schedule as Schedule;
  const from = new Date(now.getTime() - hoursBack * 3_600_000);
  const to = new Date(now.getTime() + hoursAhead * 3_600_000);
  const logged = new Map<number, StoredRecord>();
  for (const d of doses) {
    if (d.deletedAt === null && d.data.medicationId === medication.id) {
      logged.set(Date.parse(String(d.data.occurrenceAt)), d);
    }
  }
  return occurrencesBetween(schedule, from, to).map((occurrenceAt) => ({
    occurrenceAt,
    dose: logged.get(Date.parse(occurrenceAt)),
  }));
}

/** Whether the course has ended (endOn in the past). */
export function courseEnded(medication: StoredRecord, today: string): boolean {
  const end = (medication.data.schedule as Schedule | undefined)?.endOn;
  return typeof end === 'string' && end < today;
}
