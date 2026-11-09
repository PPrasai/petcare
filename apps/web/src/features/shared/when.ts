import type { TodayItem } from '../../application/today';
import type { ItemStatus } from '../../application/ranking';
import { t } from '../../i18n/t';

const DAY_MS = 86_400_000;

export const timeText = (iso: string, tz: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { timeZone: tz, hour: 'numeric', minute: '2-digit' });

export const dateText = (iso: string, tz: string): string =>
  new Date(iso).toLocaleDateString(undefined, {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

/** The second line of a task: "Today, 6:00 pm", "Overdue by 3 days", "Due Sat, 14 Nov". */
export function whenText(item: TodayItem, status: ItemStatus, now: Date, tz: string): string {
  if (status === 'overdue') {
    const days = Math.floor((now.getTime() - Date.parse(item.occurrenceAt)) / DAY_MS);
    if (days >= 1) return t(days === 1 ? 'task.overdueDay' : 'task.overdueDays', { count: days });
    return t('task.overdueSince', { time: timeText(item.occurrenceAt, tz) });
  }
  if (status === 'today') return t('task.todayAt', { time: timeText(item.occurrenceAt, tz) });
  return t('task.dueOn', { date: dateText(item.occurrenceAt, tz) });
}
