import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { Card, EmptyState, Line, SectionHeader } from '../../ui';
import { useHouseholdId } from '../shared/permissions';
import { useServices } from '../shared/services-context';
import { activityText, activityWhen } from '../shared/activity-text';

const PAGE = 20;

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

  const who = (id: string) =>
    id === me
      ? t('activity.you')
      : (members.data?.find((m) => m.userId === id)?.name ?? t('activity.someone'));
  const when = (iso: string) => activityWhen(iso, tz, now);

  const all = entries.data ?? [];
  return (
    <Card data-area="act">
      <SectionHeader title={t('activity.title')} />
      {entries.data && all.length === 0 ? <EmptyState>{t('activity.empty')}</EmptyState> : null}
      {all.length > 0 ? (
        <ul aria-label={t('activity.title')}>
          {all.slice(0, shown).map((e) => (
            <Line
              key={e.key}
              testId="activity-row"
              title={activityText(e)}
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
