import type { Schedule } from '@petcare/domain';

/**
 * The repeat choices of the reminder sheet. `everyNDays` is only shown for a stored record that
 * has it; the sheet cannot create one.
 */
export type Repeat = 'once' | 'daily' | 'weekly' | 'monthly' | 'everyNDays' | 'yearly';
export const REPEATS = ['once', 'daily', 'weekly', 'monthly', 'yearly'] as const;

/** The repeats that start on a date the person picks. */
export const hasDate = (repeat: Repeat): boolean =>
  repeat === 'once' || repeat === 'monthly' || repeat === 'yearly';

/** What a reminder is about (CON-003 `reminder.category`), in the order of the chips. */
export const REMINDER_TYPES = [
  { id: 'walk', time: '18:00' },
  { id: 'medication', time: '08:00' },
  { id: 'grooming', time: '10:00' },
  { id: 'vetVisit', time: '09:00' },
  { id: 'weighIn', time: '10:00' },
  { id: 'other', time: '09:00' },
] as const;
export type ReminderCategory = (typeof REMINDER_TYPES)[number]['id'];

/** Who is reminded: everyone, only the person editing, or (kept as stored) another member. */
export type Audience = 'everyone' | 'me' | 'other';

/** When a reminder with no time of its own is due (the domain's default). */
export const DEFAULT_TIME = '09:00';

export interface ReminderFormValues {
  title: string;
  repeat: Repeat;
  /** ISO weekdays, 1 = Monday ... 7 = Sunday. */
  days: number[];
  /** The date of a one-off, or the first date of a monthly reminder. */
  date: string;
  time: string;
  /** An optional second time of a daily reminder. */
  time2: string;
  /** Only for a legacy `everyNDays` schedule. */
  everyN: string;
  /** The chosen type chip; null for a stored reminder, whose category is not edited. */
  category: ReminderCategory | null;
  audience: Audience;
}

/** A new reminder starts as a daily walk, as in the mock. */
export const emptyReminderForm = (today: string, title = ''): ReminderFormValues => ({
  title,
  repeat: 'daily',
  days: [],
  date: today,
  time: '18:00',
  time2: '',
  everyN: '',
  category: 'walk',
  audience: 'everyone',
});

/** The audience of a stored reminder as seen by `userId`. */
export const audienceOf = (stored: unknown, userId: string): Audience =>
  typeof stored !== 'string' || stored === '' ? 'everyone' : stored === userId ? 'me' : 'other';

export function reminderToForm(
  title: string,
  schedule: Schedule,
  audience: Audience = 'everyone',
): ReminderFormValues {
  const times = schedule.times ?? [];
  return {
    title,
    category: null,
    audience,
    repeat: schedule.kind,
    days: schedule.daysOfWeek ?? [],
    date: schedule.startOn,
    time: times[0] ?? DEFAULT_TIME,
    time2: schedule.kind === 'daily' ? (times[1] ?? '') : '',
    everyN: schedule.everyN === undefined ? '' : String(schedule.everyN),
  };
}

/**
 * The schedule for the form. On an edit, `base` is the stored schedule: what the sheet has no field
 * for (the end date, times past the second) is kept.
 */
export function reminderSchedule(
  values: ReminderFormValues,
  tz: string,
  today: string,
  base?: Schedule,
  now: Date = new Date(),
): Record<string, unknown> {
  const startOn = hasDate(values.repeat) ? values.date : (base?.startOn ?? today);
  const first = values.time || DEFAULT_TIME;
  const wanted = [first, values.repeat === 'daily' ? values.time2 : ''].filter(Boolean);
  const rest = base?.kind === values.repeat ? (base.times ?? []).slice(2) : [];
  const times = [...new Set([...wanted, ...rest])];
  const day = Number(values.date.slice(8, 10));
  const schedule: Record<string, unknown> = {
    tz,
    kind: values.repeat,
    startOn,
    times,
    ...(base?.endOn && values.repeat !== 'once' ? { endOn: base.endOn } : {}),
    ...(values.repeat === 'weekly' ? { daysOfWeek: [...values.days].sort() } : {}),
    ...(values.repeat === 'monthly' && day >= 1 ? { dayOfMonth: day } : {}),
    ...(values.repeat === 'everyNDays' && values.everyN ? { everyN: Number(values.everyN) } : {}),
  };
  const notBefore = notBeforeFor(schedule, base, now);
  return notBefore ? { ...schedule, notBefore } : schedule;
}

/** A schedule without the two fields that are not part of "has it changed". */
const without = (o: object): object =>
  Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'endOn' && k !== 'notBefore'));

const sorted = (o: unknown): string =>
  JSON.stringify(o, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

/**
 * CON-003 2.6: a schedule that is new, or has changed in any field but `endOn`, gets `notBefore` =
 * now, so a daily 08:00 reminder made at 18:00 is not born overdue. An unchanged schedule keeps
 * the one it had. A one-off is left alone: its date is the person's own choice, and a past one is
 * meant to be overdue.
 */
export function notBeforeFor(
  schedule: Record<string, unknown>,
  base: Schedule | undefined,
  now: Date,
): string | undefined {
  if (schedule.kind === 'once') return undefined;
  const next = without(schedule);
  if (base && sorted(without(base)) === sorted(next)) return base.notBefore;
  return now.toISOString();
}
