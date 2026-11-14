import type { Schedule } from '@petcare/domain';

/**
 * The repeat choices of the reminder sheet. `everyNDays` and `yearly` are only shown for a stored
 * record that has them; nothing here can create either before slice P6.
 */
export type Repeat = 'once' | 'daily' | 'weekly' | 'monthly' | 'everyNDays' | 'yearly';
export const REPEATS = ['once', 'daily', 'weekly', 'monthly'] as const;

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
}

export const emptyReminderForm = (today: string): ReminderFormValues => ({
  title: '',
  repeat: 'daily',
  days: [],
  date: today,
  time: DEFAULT_TIME,
  time2: '',
  everyN: '',
});

export function reminderToForm(title: string, schedule: Schedule): ReminderFormValues {
  const times = schedule.times ?? [];
  return {
    title,
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
): Record<string, unknown> {
  const dated =
    values.repeat === 'once' || values.repeat === 'monthly' || values.repeat === 'yearly';
  const startOn = dated ? values.date : (base?.startOn ?? today);
  const first = values.time || DEFAULT_TIME;
  const wanted = [first, values.repeat === 'daily' ? values.time2 : ''].filter(Boolean);
  const rest = base?.kind === values.repeat ? (base.times ?? []).slice(2) : [];
  const times = [...new Set([...wanted, ...rest])];
  const day = Number(values.date.slice(8, 10));
  return {
    tz,
    kind: values.repeat,
    startOn,
    times,
    ...(base?.endOn && values.repeat !== 'once' ? { endOn: base.endOn } : {}),
    // Kept as stored, so editing a reminder written by a newer client does not drop it.
    ...(base?.notBefore ? { notBefore: base.notBefore } : {}),
    ...(values.repeat === 'weekly' ? { daysOfWeek: [...values.days].sort() } : {}),
    ...(values.repeat === 'monthly' && day >= 1 ? { dayOfMonth: day } : {}),
    ...(values.repeat === 'everyNDays' && values.everyN ? { everyN: Number(values.everyN) } : {}),
  };
}
