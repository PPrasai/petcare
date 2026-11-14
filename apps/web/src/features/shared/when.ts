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

/** "Just now", "5 min ago", "3 h ago", "2 days ago": how long ago an instant was. */
export function relativeTime(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hours', { count: hours });
  return t('time.days', { count: Math.floor(hours / 24) });
}
