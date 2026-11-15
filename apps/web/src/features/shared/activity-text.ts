import { instantToLocalDate } from '@petcare/domain';
import type { ActivityEntry } from '../../application/activity';
import type { MessageKey } from '../../i18n/en';
import { t } from '../../i18n/t';
import { amountText } from '../log/quantity';
import { dateText, timeText } from './when';

/** The line of text of one entry. */
export function activityText(e: ActivityEntry): string {
  switch (e.kind) {
    case 'meal':
      return t('activity.meal', {
        food: e.food,
        amount:
          e.quantity !== undefined && e.unit
            ? t('activity.meal.amount', { amount: amountText(e.quantity, e.unit) })
            : '',
      });
    case 'walk':
      return t('activity.walk', { count: e.minutes });
    case 'grooming':
      return t('activity.grooming', {
        tasks: e.tasks.map((x) => t(`log.groom.task.${x}` as MessageKey)).join(', '),
        note: e.note ? t('activity.grooming.note', { note: e.note }) : '',
      });
    case 'medication':
      return t('activity.med', {
        name: e.name,
        route: e.route
          ? t('activity.med.route', { route: t(`log.med.route.${e.route}` as MessageKey) })
          : '',
        dose: e.dose ? t('activity.med.dose', { dose: e.dose }) : '',
      });
    case 'note':
      return e.text;
    case 'done':
      return t(e.skipped ? 'activity.skipped' : 'activity.done', { title: e.title });
  }
}

/** "Today, 6:00 pm" for today, else "Sat, 14 Nov, 6:00 pm". */
export function activityWhen(iso: string, tz: string, now: Date): string {
  return instantToLocalDate(Date.parse(iso), tz) === instantToLocalDate(now.getTime(), tz)
    ? t('activity.today', { time: timeText(iso, tz) })
    : `${dateText(iso, tz)}, ${timeText(iso, tz)}`;
}
