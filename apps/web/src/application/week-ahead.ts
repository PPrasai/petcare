import { isMeal } from './ranking';
import type { TodayItem, TodayView } from './today';

/** How far ahead "This week" looks, and how many items the Home panel lists (SPEC-petcare-004 S-10). */
export const WEEK_DAYS = 7;
export const WEEK_SHOWN = 5;

const DAY_MS = 86_400_000;

export interface WeekAhead {
  /** The soonest items, at most `limit`. */
  items: TodayItem[];
  /** How many more are due in the window than are listed. */
  more: number;
}

/**
 * The things due in the next 7 days, soonest first, for the Home dashboard. Only a pet's own items
 * count (not meals and not reminders without a pet), and only the ones that are still ahead:
 * what is due today is in the Today panel, and a snoozed item comes back when its snooze ends.
 */
export function weekAhead(view: TodayView, now: Date, limit = WEEK_SHOWN): WeekAhead {
  const until = now.getTime() + WEEK_DAYS * DAY_MS;
  const due = view.upcoming
    .filter((item) => {
      const at = Date.parse(item.occurrenceAt);
      return item.petId !== null && !isMeal(item) && at > now.getTime() && at <= until;
    })
    .sort((a, b) => a.occurrenceAt.localeCompare(b.occurrenceAt) || a.key.localeCompare(b.key));
  return { items: due.slice(0, limit), more: Math.max(due.length - limit, 0) };
}
