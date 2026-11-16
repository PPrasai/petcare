import type { WeekAhead as Week } from '../../application/week-ahead';
import { t } from '../../i18n/t';
import { PetAvatar } from '../shared/PetAvatar';
import { dateText } from '../shared/when';
import type { HomePet } from './use-home-data';

/** "This week": what is due in the next 7 days, at most five, with the rest counted. */
export function WeekAhead({
  week,
  pets,
  tz,
}: {
  week: Week;
  pets: ReadonlyMap<string, HomePet>;
  tz: string;
}) {
  return (
    <div className="card" data-area="week">
      <div className="sech">
        <h2>{t('home.thisWeek')}</h2>
      </div>
      {week.items.length === 0 ? (
        <p className="muted">{t('home.weekEmpty')}</p>
      ) : (
        <ul className="plain">
          {week.items.map((item) => {
            const pet = item.petId ? pets.get(item.petId) : undefined;
            return (
              <li key={item.key} className="line" data-testid="week-row">
                <div className="lead">
                  {pet ? <PetAvatar pet={pet.record} size={28} /> : null}
                  <div className="l">
                    <b>{item.title}</b>
                    <span>
                      {t('home.petWhen', {
                        pet: item.petName ?? '',
                        when: dateText(item.occurrenceAt, tz),
                      })}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {week.more > 0 ? <p className="muted">{t('home.more', { count: week.more })}</p> : null}
    </div>
  );
}
