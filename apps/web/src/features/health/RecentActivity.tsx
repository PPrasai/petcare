import { useQuery } from '@tanstack/react-query';
import { instantToLocalDate } from '@petcare/domain';
import { useState } from 'react';
import type { ActivityEntry } from '../../application/activity';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { Card, EmptyState, Line, SectionHeader } from '../../ui';
import { amountText } from '../log/quantity';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { dateText, timeText } from '../shared/when';
import type { MessageKey } from '../../i18n/en';

const PAGE = 20;

/** The line of text of one entry. */
function textOf(e: ActivityEntry): string {
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

/**
 * Recent activity (SPEC-petcare-002 P7): care logs, completions and notes of one pet with who did
 * them, newest first, 20 at a time.
 */
export function RecentActivity({ petId }: { petId: string }) {
  const { log, households } = useServices();
  const householdId = useHouseholdId();
  const tz = useSessionStore((s) => s.preferences.timeZone);
  const me = useSessionStore((s) => s.user?.id ?? '');
  const [shown, setShown] = useState(PAGE);
  const entries = useQuery({
    queryKey: ['today', 'activity', householdId, petId],
    queryFn: () => log.activity(householdId, petId),
    enabled: householdId !== '',
  });
  const members = useQuery({
    queryKey: ['members', householdId],
    queryFn: () => households.members(householdId),
    enabled: householdId !== '',
    retry: false,
  });
  const now = new Date();
  const today = instantToLocalDate(now.getTime(), tz);

  const who = (id: string) =>
    id === me
      ? t('activity.you')
      : (members.data?.find((m) => m.userId === id)?.name ?? t('activity.someone'));
  const when = (iso: string) =>
    instantToLocalDate(Date.parse(iso), tz) === today
      ? t('activity.today', { time: timeText(iso, tz) })
      : `${dateText(iso, tz)}, ${timeText(iso, tz)}`;

  const all = entries.data ?? [];
  return (
    <Card>
      <SectionHeader title={t('activity.title')} />
      {entries.data && all.length === 0 ? <EmptyState>{t('activity.empty')}</EmptyState> : null}
      {all.length > 0 ? (
        <ul aria-label={t('activity.title')}>
          {all.slice(0, shown).map((e) => (
            <Line
              key={e.key}
              testId="activity-row"
              title={textOf(e)}
              sub={t('activity.sub', { when: when(e.at), who: who(e.by) })}
            />
          ))}
        </ul>
      ) : null}
      {all.length > shown ? (
        <button type="button" className="linkbtn" onClick={() => setShown(shown + PAGE)}>
          {t('activity.more')}
        </button>
      ) : null}
    </Card>
  );
}
