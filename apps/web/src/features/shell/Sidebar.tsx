import { Link, useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { t } from '../../i18n/t';
import { activeHousehold, useSessionStore } from '../../state/session';
import { Icon, Initials } from '../../ui';
import { useRankedPets } from '../home/use-home-data';
import { useLogSheet } from '../log/log-sheet';
import { PetAvatar } from '../shared/PetAvatar';
import { useCan } from '../shared/permissions';
import { useDemo } from '../shared/demo';
import { SyncIndicator } from '../sync/SyncIndicator';
import {
  CONTACTS,
  EMERGENCY,
  EXPENSES,
  HOME,
  HOUSEHOLD,
  SETTINGS,
  isCurrent,
  openPetId,
} from './destinations';

const DESTINATIONS = [HOME, EXPENSES, EMERGENCY, HOUSEHOLD, CONTACTS, SETTINGS];

/**
 * The desktop frame's left column (SPEC-petcare-004 5.4): Log, the six destinations, the pets in
 * Home order, the sync pill and the account. Collapsed to a 68 px rail it keeps every name as
 * visually hidden text (never `display: none`), so each control keeps its accessible name.
 */
export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { pathname } = useLocation();
  const logSheet = useLogSheet();
  const canLog = useCan('create', 'measurement');
  const canAdd = useCan('create', 'pet');
  const demo = useDemo();
  const ranked = useRankedPets();
  const user = useSessionStore((s) => s.user);
  const household = useSessionStore((s) => activeHousehold(s)?.name ?? '');
  const overdue = ranked.reduce(
    (n, r) => n + r.open.filter((i) => i.status === 'overdue').length,
    0,
  );
  const toggleLabel = t(collapsed ? 'nav.expand' : 'nav.collapse');
  const current = openPetId(pathname);

  const label = (text: string): ReactNode => <span className="lbl">{text}</span>;

  return (
    <aside id="sidebar" className="side" aria-label={t('nav.sidebar')}>
      <div className="sbtop">
        <span className="brand">
          <span className="logo">
            <Icon name="paw" />
          </span>
          {label(t('app.name'))}
        </span>
        <button
          type="button"
          className="iconbtn"
          aria-expanded={!collapsed}
          aria-controls="sidebar"
          aria-label={toggleLabel}
          title={toggleLabel}
          onClick={onToggle}
        >
          <Icon name="side" />
        </button>
      </div>
      {canLog ? (
        <button
          type="button"
          data-testid="log-open"
          className="logbtn"
          aria-label={t('log.open')}
          title={t('log.open')}
          onClick={() => logSheet.open(current ? { petId: current } : {})}
        >
          <Icon name="plus" />
          {label(t('log.open'))}
        </button>
      ) : null}
      <nav className="navl" aria-label={t('nav.main')}>
        {DESTINATIONS.map((dest) => (
          <Link
            key={dest.to}
            to={dest.to}
            className="lnk"
            title={t(dest.label)}
            aria-current={isCurrent(dest, pathname) ? 'page' : undefined}
            {...(dest.to === '/' && overdue > 0 ? { 'aria-describedby': 'side-overdue' } : {})}
          >
            <Icon name={dest.icon} />
            {label(t(dest.label))}
            {dest.to === '/' && overdue > 0 ? (
              <span className="cnt" aria-hidden="true">
                {overdue}
              </span>
            ) : null}
          </Link>
        ))}
        {/* The count is a description of Home, so the link keeps the name "Home". */}
        {overdue > 0 ? (
          <span id="side-overdue" className="sr-only">
            {t('nav.overdueCount', { n: overdue })}
          </span>
        ) : null}
      </nav>
      <div className="sbsec">
        {label(t('nav.pets'))}
        {canAdd ? (
          <Link
            to="/pets/new"
            search={{ step: 1 }}
            className="iconbtn sm"
            aria-label={t('pets.add')}
            title={t('pets.add')}
          >
            <Icon name="plus" />
          </Link>
        ) : null}
      </div>
      {ranked.length === 0 ? (
        <div className="sbpets" aria-hidden="true" />
      ) : (
        <ul className="sbpets" aria-label={t('nav.pets')}>
          {ranked.map((r) => (
            <li key={r.pet.id}>
              <Link
                to="/pets/$petId"
                params={{ petId: r.pet.id }}
                search={{ tab: 'overview' }}
                className="spet"
                data-testid="side-pet"
                title={r.pet.name}
                aria-current={current === r.pet.id ? 'page' : undefined}
              >
                <PetAvatar
                  pet={r.pet.record}
                  size={30}
                  dot={r.status === 'clear' ? 'ok' : r.status}
                />
                <span className="tx">
                  <b>{r.pet.name}</b>
                  <span className={r.top ? r.top.status : 'ok'}>
                    {r.top ? r.top.title : t('home.label.allCaughtUp')}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="sbfoot">
        {demo ? null : <SyncIndicator />}
        <div className="me">
          <Initials name={user?.name ?? ''} seed={user?.id ?? ''} />
          <span className="tx">
            <b>{user?.name ?? ''}</b>
            <span>{household}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
