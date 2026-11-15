import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { HouseholdActivityEntry } from '../../application/household-activity';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { activityText, activityWhen } from '../shared/activity-text';
import { PetAvatar } from '../shared/PetAvatar';
import { useServices } from '../shared/services-context';
import type { HomePet } from './use-home-data';

/** The panel itself: what everyone did lately, with who and when. */
export function RecentCareList({
  entries,
  pets,
  who,
  tz,
  now,
}: {
  entries: readonly HouseholdActivityEntry[];
  pets: ReadonlyMap<string, HomePet>;
  who: (userId: string) => string;
  tz: string;
  now: Date;
}) {
  return (
    <div className="card" data-area="recent">
      <div className="sech">
        <h2>{t('home.recentCare')}</h2>
        <Link to="/household" className="linkbtn">
          {t('home.seeAll')}
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="muted">{t('home.recentEmpty')}</p>
      ) : (
        <ul className="plain" aria-label={t('home.recentCare')}>
          {entries.map((e) => {
            const pet = pets.get(e.petId);
            return (
              <li key={e.key} className="line" data-testid="recent-row">
                <div className="lead">
                  {pet ? <PetAvatar pet={pet.record} size={28} /> : null}
                  <div className="l">
                    <b>{activityText(e)}</b>
                    <span>
                      {t('home.recentSub', {
                        pet: pet?.name ?? '',
                        who: who(e.by),
                        when: activityWhen(e.at, tz, now),
                      })}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Recent care on Home: reads the household's activity and the member names. */
export function RecentCare({
  householdId,
  pets,
  tz,
  now,
}: {
  householdId: string;
  pets: ReadonlyMap<string, HomePet>;
  tz: string;
  now: Date;
}) {
  const { log, households } = useServices();
  const me = useSessionStore((s) => s.user?.id ?? '');
  const ids = [...pets.values()].filter((p) => !p.archived).map((p) => p.id);
  const entries = useQuery({
    queryKey: ['today', 'activity', householdId, 'household', ids],
    queryFn: () => log.householdActivity(householdId, ids),
    enabled: householdId !== '' && ids.length > 0,
  });
  const members = useQuery({
    queryKey: ['members', householdId],
    queryFn: () => households.members(householdId),
    enabled: householdId !== '',
    retry: false,
  });
  const who = (id: string) =>
    id === me
      ? t('activity.you')
      : (members.data?.find((m) => m.userId === id)?.name ?? t('activity.someone'));
  return <RecentCareList entries={entries.data ?? []} pets={pets} who={who} tz={tz} now={now} />;
}
