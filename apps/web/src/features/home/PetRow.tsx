import { Link } from '@tanstack/react-router';
import { completable } from '../../application/today';
import type { RankedItem, RankedPet } from '../../application/ranking';
import { t } from '../../i18n/t';
import { Icon } from '../../ui';
import { PetAvatar } from '../shared/PetAvatar';
import { useCan } from '../shared/permissions';
import { whenText } from '../shared/when';
import type { HomePet } from './HomePage';

/** One pet on Home: status dot, name, the most urgent task and how many more there are. */
export function PetRow({
  ranked,
  selected,
  now,
  tz,
  checked,
  onCheck,
}: {
  ranked: RankedPet<HomePet>;
  selected: boolean;
  now: Date;
  tz: string;
  /** The top task was just checked and the order is being held (QA-26). */
  checked: boolean;
  onCheck: (item: RankedItem, checked: boolean) => void;
}) {
  const { pet, top, more, status, label } = ranked;
  const name = String(pet.record.data.name);
  const canLog = useCan('create', 'careCompletion');
  // Vaccinations and visits are answered by recording them, not by a tick.
  const tickable = top !== null && canLog && completable(top.sourceType);
  const taskName = top ? `${top.title} (${name})` : '';
  return (
    <li
      className={`prow ${checked ? 'checked' : ''}`}
      data-testid="pet-row"
      aria-current={selected}
    >
      <Link
        to="/pets/$petId"
        params={{ petId: pet.id }}
        search={{ tab: 'overview' }}
        className="rowmain"
      >
        <PetAvatar pet={pet.record} size={56} dot={status === 'clear' ? 'ok' : status} />
        <span className="nm">
          <b>{name}</b>
          {top && checked ? (
            <span className="l2 ok">
              <b>{top.title}</b> · {t('task.doneBy', { who: t('task.you') })}
            </span>
          ) : top ? (
            <span className={`l2 ${top.status}`}>
              <b>{top.title}</b> · {whenText(top, top.status, now, tz)}
            </span>
          ) : (
            <span className="l2 ok">{t(`home.label.${label}`)}</span>
          )}
          {more > 0 ? <span className="more">{t('home.more', { count: more })}</span> : null}
        </span>
      </Link>
      {tickable ? (
        <button
          type="button"
          className="chk big"
          data-testid="task-check"
          aria-pressed={checked}
          aria-label={t(checked ? 'home.checkUndo' : 'home.check', { name: taskName })}
          onClick={() => onCheck(top, checked)}
        >
          {checked ? <Icon name="check" /> : null}
        </button>
      ) : top ? null : (
        <span className="done-ic">
          <Icon name="check" />
        </span>
      )}
    </li>
  );
}
