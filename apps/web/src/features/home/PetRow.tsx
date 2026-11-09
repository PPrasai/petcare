import { Link } from '@tanstack/react-router';
import type { RankedPet } from '../../application/ranking';
import { t } from '../../i18n/t';
import { Icon } from '../../ui';
import { PetAvatar } from '../shared/PetAvatar';
import { whenText } from '../shared/when';
import type { HomePet } from './HomePage';

/** One pet on Home: status dot, name, the most urgent task and how many more there are. */
export function PetRow({
  ranked,
  selected,
  now,
  tz,
}: {
  ranked: RankedPet<HomePet>;
  selected: boolean;
  now: Date;
  tz: string;
}) {
  const { pet, top, more, status, label } = ranked;
  const name = String(pet.record.data.name);
  return (
    <li className="prow" data-testid="pet-row" aria-current={selected}>
      <Link
        to="/pets/$petId"
        params={{ petId: pet.id }}
        search={{ tab: 'overview' }}
        className="rowmain"
      >
        <PetAvatar pet={pet.record} size={56} dot={status === 'clear' ? 'ok' : status} />
        <span className="nm">
          <b>{name}</b>
          {top ? (
            <span className={`l2 ${top.status}`}>
              <b>{top.title}</b> · {whenText(top, top.status, now, tz)}
            </span>
          ) : (
            <span className="l2 ok">{t(`home.label.${label}`)}</span>
          )}
          {more > 0 ? <span className="more">{t('home.more', { count: more })}</span> : null}
        </span>
      </Link>
      {top ? null : (
        <span className="done-ic">
          <Icon name="check" />
        </span>
      )}
    </li>
  );
}
