import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { weekAhead } from '../../application/week-ahead';
import { completable } from '../../application/today';
import type { TodayView } from '../../application/today';
import type { RankedItem, RankedPet } from '../../application/ranking';
import { isMeal } from '../../application/ranking';
import { t } from '../../i18n/t';
import { Disclosure, EmptyState, Icon } from '../../ui';
import { PetAvatar } from '../shared/PetAvatar';
import { useCan } from '../shared/permissions';
import { whenText } from '../shared/when';
import { PetRow } from './PetRow';
import { RecentCare } from './RecentCare';
import { WeekAhead } from './WeekAhead';
import type { HomePet } from './use-home-data';

interface Props {
  ranked: RankedPet<HomePet>[];
  /** The view the order is built from (held while the Undo toast is open). */
  view: TodayView;
  pets: HomePet[];
  householdId: string;
  now: Date;
  tz: string;
  label: string;
  greeting: string;
  lede: ReactNode;
  firstRun: boolean;
  /** Keys of the tasks ticked in this hold. */
  held: ReadonlySet<string>;
  onCheck: (item: RankedItem, petName: string, already: boolean) => void;
}

/** A tick of the Today panel: the same check path as a pet row. */
function TodayRow({
  item,
  pet,
  checked,
  now,
  tz,
  onCheck,
}: {
  item: RankedItem;
  pet: HomePet | undefined;
  checked: boolean;
  now: Date;
  tz: string;
  onCheck: () => void;
}) {
  const canLog = useCan('create', 'careCompletion');
  const name = pet?.name ?? item.petName ?? '';
  const tickable = canLog && completable(item.sourceType);
  return (
    <li className={`task ${checked ? 'checked' : ''}`} data-testid="today-row">
      {pet ? <PetAvatar pet={pet.record} size={28} /> : null}
      <span className="tx">
        <b>{item.title}</b>
        <span className={checked ? 'ok' : item.status}>
          {t('home.petWhen', { pet: name, when: whenText(item, item.status, now, tz) })}
        </span>
      </span>
      {tickable ? (
        <button
          type="button"
          className="chk"
          data-testid="today-check"
          aria-pressed={checked}
          aria-label={t(checked ? 'home.checkUndo' : 'home.check', {
            name: `${item.title} (${name})`,
          })}
          onClick={onCheck}
        >
          {checked ? <Icon name="check" /> : null}
        </button>
      ) : null}
    </li>
  );
}

/**
 * Home from 860 px (SPEC-petcare-004 S-10): the pets, what is due today, the week ahead and the
 * household's recent care, in panels that fit the window without scrolling the page.
 */
export function HomeDashboard(p: Props) {
  const canAdd = useCan('create', 'pet');
  const byId = new Map(p.pets.map((x) => [x.id, x]));
  const open = p.ranked.flatMap((r) => r.open);
  const overdue = open.filter((i) => i.status === 'overdue');
  const today = open.filter((i) => i.status === 'today');
  const soon = open.filter((i) => i.status === 'soon');
  const done = p.view.done.filter((i) => !isMeal(i) && i.petId !== null);
  const byTime = (a: RankedItem, b: RankedItem) => a.occurrenceAt.localeCompare(b.occurrenceAt);
  const total = open.filter((i) => i.status !== 'soon').length + done.length;
  const week = weekAhead(p.view, p.now);
  const archived = p.pets.filter((x) => x.archived);

  const group = (title: string, items: RankedItem[], tone: string) =>
    items.length === 0 ? null : (
      <section aria-label={title} className={`grp ${tone}`}>
        <h3>
          {title} <span className="cnt">{items.length}</span>
        </h3>
        <ul className="plain">
          {[...items].sort(byTime).map((item) => (
            <TodayRow
              key={item.key}
              item={item}
              pet={item.petId ? byId.get(item.petId) : undefined}
              checked={p.held.has(item.key)}
              now={p.now}
              tz={p.tz}
              onCheck={() =>
                p.onCheck(
                  item,
                  (item.petId ? byId.get(item.petId)?.name : undefined) ?? item.petName ?? '',
                  p.held.has(item.key),
                )
              }
            />
          ))}
        </ul>
      </section>
    );

  const head = (
    <div className="greet">
      <span className="label">{p.label}</span>
      <h1>{p.greeting}</h1>
      <p className="lede">{p.lede}</p>
      {canAdd && !p.firstRun ? (
        <div className="acts">
          <Link to="/pets/new" search={{ step: 1 }} className="btn">
            <Icon name="plus" /> {t('pets.add')}
          </Link>
        </div>
      ) : null}
    </div>
  );

  if (p.firstRun) {
    return (
      <>
        {head}
        <div className="two" data-layout="single">
          <div className="card" data-area="pets">
            <EmptyState
              icon="paw"
              title={t('home.firstRun.title')}
              action={
                canAdd ? (
                  <Link to="/pets/new" search={{ step: 1 }} className="btn primary">
                    <Icon name="plus" /> {t('pets.add')}
                  </Link>
                ) : undefined
              }
            >
              {t(canAdd ? 'home.firstRun.body' : 'pets.empty')}
            </EmptyState>
          </div>
        </div>
      </>
    );
  }

  const quiet = overdue.length + today.length + soon.length + done.length === 0;
  return (
    <>
      {head}
      <div className="two" data-layout="home">
        <div className="card" data-area="pets">
          <div className="sech">
            <h2>{t('home.yourPets')}</h2>
          </div>
          <ul className="plist" aria-label={t('home.listLabel')}>
            {p.ranked.map((r) => (
              <PetRow
                key={r.pet.id}
                ranked={r}
                selected={false}
                now={p.now}
                tz={p.tz}
                checked={r.top !== null && p.held.has(r.top.key)}
                onCheck={(item, already) => p.onCheck(item, r.pet.name, already)}
              />
            ))}
            {canAdd ? (
              <li>
                <Link to="/pets/new" search={{ step: 1 }} className="addrow">
                  <Icon name="plus" /> {t('pets.add')}
                </Link>
              </li>
            ) : null}
          </ul>
          {archived.length > 0 ? (
            <Disclosure
              title={t('home.archived')}
              hint={t('home.archivedCount', { count: archived.length })}
            >
              <ul className="plist">
                {archived.map((x) => (
                  <li key={x.id} className="line">
                    <Link
                      to="/pets/$petId"
                      params={{ petId: x.id }}
                      search={{ tab: 'overview' }}
                      className="rowmain"
                    >
                      <b>{x.name}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}
        </div>
        <div className="card" data-area="today">
          <div className="sech">
            <h2>{t('task.tag.today')}</h2>
            <span className="muted">{t('home.todayDone', { done: done.length, total })}</span>
          </div>
          {quiet ? <p className="muted">{t('task.upNextEmpty')}</p> : null}
          {group(t('task.tag.overdue'), overdue, 'overdue')}
          {group(t('task.tag.today'), today, 'today')}
          {group(t('home.label.comingUp'), soon, 'soon')}
          {done.length > 0 ? (
            <section aria-label={t('home.groupDone')} className="grp ok">
              <h3>
                {t('home.groupDone')} <span className="cnt">{done.length}</span>
              </h3>
              <ul className="plain">
                {done.map((item) => {
                  const pet = item.petId ? byId.get(item.petId) : undefined;
                  return (
                    <li key={item.key} className="task checked" data-testid="today-row">
                      {pet ? <PetAvatar pet={pet.record} size={28} /> : null}
                      <span className="tx">
                        <b>{item.title}</b>
                        <span className="ok">{pet?.name ?? item.petName ?? ''}</span>
                      </span>
                      <span className="done-ic">
                        <Icon name="check" />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
        <WeekAhead week={week} pets={byId} tz={p.tz} />
        <RecentCare householdId={p.householdId} pets={byId} tz={p.tz} now={p.now} />
      </div>
    </>
  );
}
