import { completable, skippable } from '../../application/today';
import type { TodayItem } from '../../application/today';
import type { ItemStatus } from '../../application/ranking';
import { t } from '../../i18n/t';
import type { SyntheticEvent } from 'react';
import { Icon, Pill } from '../../ui';
import { useCan } from '../shared/permissions';
import { useWideScreen } from '../shared/use-wide-screen';
import { timeText, whenText } from '../shared/when';

export type TaskAction = 'done' | 'skip' | 'snoozeHour' | 'snoozeTomorrow';

interface TaskRowProps {
  item: TodayItem;
  /** Present for open items; done and snoozed rows have none. */
  status?: ItemStatus;
  now: Date;
  tz: string;
  onAction?: (action: TaskAction) => void;
}

/** One task with its "More actions" menu: Done, Skip, Snooze 1 hour, Snooze until tomorrow. */
export function TaskRow({ item, status, now, tz, onAction }: TaskRowProps) {
  const canLog = useCan('create', 'careCompletion');
  const wide = useWideScreen();
  const done = item.doneBy !== null;
  const pet = item.petName ? ` (${item.petName})` : '';

  const sub = done
    ? t(item.skipped ? 'task.skippedBy' : 'task.doneBy', {
        who: t(item.doneBy === 'me' ? 'task.you' : 'task.someone'),
      })
    : item.snoozedUntil
      ? t('task.snoozedUntil', { time: timeText(item.snoozedUntil, tz) })
      : status
        ? whenText(item, status, now, tz)
        : '';

  const act = (action: TaskAction) => (event: { currentTarget: HTMLElement }) => {
    onAction?.(action);
    const menu = event.currentTarget.closest('details');
    if (menu) menu.open = false;
  };

  // From 860 px the menu is fixed to the viewport, below its button or above it when less than 200 px
  // remain, so the panel it sits in does not clip it (SPEC-petcare-004 S-12).
  const place = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const menu = event.currentTarget.querySelector<HTMLElement>('.menu');
    const at = event.currentTarget.getBoundingClientRect();
    if (!wide || !event.currentTarget.open || !menu) return;
    const up = window.innerHeight - at.bottom < 200;
    menu.style.cssText = `position:fixed;right:${window.innerWidth - at.right}px;${
      up ? `top:auto;bottom:${window.innerHeight - at.top + 4}px` : `top:${at.bottom + 4}px`
    }`;
  };

  const tag =
    !done && status && status !== 'soon' ? (
      <Pill tone={status}>{t(status === 'overdue' ? 'task.tag.overdue' : 'task.tag.today')}</Pill>
    ) : null;

  return (
    <div className={`task ${done ? 'done' : ''}`}>
      <div className="tt">
        <b>{item.title}</b>
        <span>{sub}</span>
      </div>
      {tag}
      {!done && onAction ? (
        <details className="moremenu" onToggle={place}>
          <summary aria-label={t('task.moreActions', { name: `${item.title}${pet}` })}>
            <Icon name="more" />
          </summary>
          <div className="menu">
            {completable(item.sourceType) && canLog ? (
              <button type="button" onClick={act('done')}>
                {t('task.done')}
              </button>
            ) : null}
            {skippable(item.sourceType) && canLog ? (
              <button type="button" onClick={act('skip')}>
                {t('task.skip')}
              </button>
            ) : null}
            <button type="button" onClick={act('snoozeHour')}>
              {t('task.snoozeHour')}
            </button>
            <button type="button" onClick={act('snoozeTomorrow')}>
              {t('task.snoozeTomorrow')}
            </button>
          </div>
        </details>
      ) : null}
    </div>
  );
}
