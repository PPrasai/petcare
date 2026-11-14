import type { Schedule } from '@petcare/domain';
import type { MessageKey } from '../../i18n/en';
import { t } from '../../i18n/t';
import { formatDate } from '../../lib/format';
import { DEFAULT_TIME } from '../../application/reminder-form';

type DatePrefs = Parameters<typeof formatDate>[1];

/** One line for a schedule, for example "Daily at 08:00 and 20:00" (mock `repText`). */
export function repeatText(schedule: Schedule, prefs: DatePrefs): string {
  const [first, second] = schedule.times ?? [];
  const time = first ?? DEFAULT_TIME;
  switch (schedule.kind) {
    case 'daily':
      return second
        ? t('reminder.when.daily2', { time, time2: second })
        : t('reminder.when.daily', { time });
    case 'weekly':
      return t('reminder.when.weekly', {
        days: [...(schedule.daysOfWeek ?? [])]
          .sort()
          .map((d) => t(`schedule.day.${d}` as MessageKey))
          .join(', '),
        time,
      });
    case 'monthly':
      return t('reminder.when.monthly', { date: formatDate(schedule.startOn, prefs), time });
    case 'everyNDays':
      return t('reminder.when.everyN', { count: schedule.everyN ?? 1, time });
    default:
      return t('reminder.when.once', { date: formatDate(schedule.startOn, prefs), time });
  }
}
