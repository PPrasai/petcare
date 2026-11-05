import { DEFAULT_DUE_TIME } from './constants';
import type { Schedule } from './schemas';

/**
 * Occurrence rules (CON-petcare-002 2.6). Occurrences are computed in the schedule's tz.
 * - no times -> 09:00 local
 * - monthly dayOfMonth beyond the month length -> last day of that month
 * - DST gap (time does not exist) -> shifted forward by the gap length
 * - DST overlap (time happens twice) -> the first occurrence
 */

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Offset of `tz` from UTC at an instant, in ms (local = utc + offset). */
export function offsetAt(ms: number, tz: string): number {
  const parts: Record<string, number> = {};
  for (const p of formatterFor(tz).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(
    parts.year ?? 1970,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Local calendar date + "HH:mm" in `tz` -> the instant (see rules above). */
export function localToInstant(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const local = Date.UTC(y, m - 1, d, hh, mm);
  const before = offsetAt(local - DAY_MS, tz);
  const after = offsetAt(local + DAY_MS, tz);
  const valid = [...new Set([before, after])]
    .map((offset) => ({ offset, t: local - offset }))
    .filter(({ offset, t }) => offsetAt(t, tz) === offset)
    .map(({ t }) => t);
  if (valid.length > 0) return new Date(Math.min(...valid));
  return new Date(local - before);
}

/** The calendar date ("YYYY-MM-DD") of an instant in `tz`. */
export function instantToLocalDate(ms: number, tz: string): string {
  return new Date(ms + offsetAt(ms, tz)).toISOString().slice(0, 10);
}

export const dayNumber = (date: string): number => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
export const dateFromDayNumber = (n: number): string =>
  new Date(n * DAY_MS).toISOString().slice(0, 10);
/** ISO weekday, 1 = Monday ... 7 = Sunday. */
export const isoWeekday = (n: number): number => (((((n % 7) + 7) % 7) + 3) % 7) + 1;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Local dates (as day numbers) a schedule falls on between two day numbers, inclusive. */
function scheduleDays(s: Schedule, lo: number, hi: number): number[] {
  const start = dayNumber(s.startOn);
  const from = Math.max(lo, start);
  const to = s.endOn ? Math.min(hi, dayNumber(s.endOn)) : hi;
  if (from > to) return [];
  const days: number[] = [];
  switch (s.kind) {
    case 'once':
      if (start >= from && start <= to) days.push(start);
      break;
    case 'daily':
      for (let n = from; n <= to; n++) days.push(n);
      break;
    case 'weekly':
      for (let n = from; n <= to; n++) if (s.daysOfWeek?.includes(isoWeekday(n))) days.push(n);
      break;
    case 'everyNDays': {
      const every = s.everyN ?? 1;
      const first = start + Math.ceil((from - start) / every) * every;
      for (let n = first; n <= to; n += every) days.push(n);
      break;
    }
    case 'monthly': {
      const wanted = s.dayOfMonth ?? 1;
      const first = new Date(from * DAY_MS);
      let year = first.getUTCFullYear();
      let month = first.getUTCMonth() + 1;
      for (;;) {
        const day = Math.min(wanted, daysInMonth(year, month));
        const n = Date.UTC(year, month - 1, day) / DAY_MS;
        if (n > to) break;
        if (n >= from) days.push(n);
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
      break;
    }
  }
  return days;
}

/** Occurrence instants (ISO, ending in Z) with from <= instant <= to, ascending. */
export function occurrencesBetween(
  schedule: Schedule,
  from: Date | string,
  to: Date | string,
): string[] {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const tz = schedule.tz;
  const lo = dayNumber(instantToLocalDate(fromMs, tz)) - 1;
  const hi = dayNumber(instantToLocalDate(toMs, tz)) + 1;
  const times = schedule.times && schedule.times.length > 0 ? schedule.times : [DEFAULT_DUE_TIME];
  const result = new Set<string>();
  for (const day of scheduleDays(schedule, lo, hi)) {
    for (const time of times) {
      const at = localToInstant(dateFromDayNumber(day), time, tz);
      if (at.getTime() >= fromMs && at.getTime() <= toMs) {
        result.add(at.toISOString().replace('.000Z', 'Z'));
      }
    }
  }
  return [...result].sort();
}

/** A single date due at 09:00 local in `tz` (vaccination nextDueOn, vetVisit followUpOn). */
export function dueAtNineLocal(date: string, tz: string): string {
  return localToInstant(date, DEFAULT_DUE_TIME, tz).toISOString().replace('.000Z', 'Z');
}
