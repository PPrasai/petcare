import type { Schedule } from '@petcare/domain';

export const SCHEDULE_KINDS = ['once', 'daily', 'weekly', 'monthly', 'everyNDays'] as const;

export interface ScheduleFormValues {
  kind: Schedule['kind'];
  /** Comma-separated HH:MM, for example "08:00, 20:00". Empty means the default time. */
  times: string;
  startOn: string;
  endOn: string;
  /** ISO weekdays, 1 = Monday ... 7 = Sunday. */
  daysOfWeek: number[];
  dayOfMonth: string;
  everyN: string;
}

export const emptyScheduleForm = (startOn: string): ScheduleFormValues => ({
  kind: 'daily',
  times: '',
  startOn,
  endOn: '',
  daysOfWeek: [],
  dayOfMonth: '',
  everyN: '',
});

const splitTimes = (text: string): string[] =>
  text
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/^\d:\d\d$/.test(s) ? `0${s}` : s));

/** The schedule for the form values, ready for validation by the domain schema. */
export function scheduleFromForm(values: ScheduleFormValues, tz: string): Record<string, unknown> {
  const times = splitTimes(values.times);
  return {
    tz,
    kind: values.kind,
    startOn: values.startOn,
    ...(times.length > 0 ? { times } : {}),
    ...(values.endOn ? { endOn: values.endOn } : {}),
    ...(values.kind === 'weekly' ? { daysOfWeek: [...values.daysOfWeek].sort() } : {}),
    ...(values.kind === 'monthly' && values.dayOfMonth
      ? { dayOfMonth: Number(values.dayOfMonth) }
      : {}),
    ...(values.kind === 'everyNDays' && values.everyN ? { everyN: Number(values.everyN) } : {}),
  };
}

/** The form values for a stored schedule (for editing). */
export function scheduleToForm(schedule: Schedule): ScheduleFormValues {
  return {
    kind: schedule.kind,
    times: (schedule.times ?? []).join(', '),
    startOn: schedule.startOn,
    endOn: schedule.endOn ?? '',
    daysOfWeek: schedule.daysOfWeek ?? [],
    dayOfMonth: schedule.dayOfMonth === undefined ? '' : String(schedule.dayOfMonth),
    everyN: schedule.everyN === undefined ? '' : String(schedule.everyN),
  };
}
