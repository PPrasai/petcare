import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { Icon } from '../../ui';
import type { IconName } from '../../ui';
import { LogSheet } from '../log/LogSheet';
import { useLogSheet } from '../log/log-sheet';
import { useCan } from '../shared/permissions';
import { useDemo } from '../shared/demo';
import { useWideScreen } from '../shared/use-wide-screen';
import { SyncIndicator } from '../sync/SyncIndicator';
import { DemoBanner } from './DemoBanner';
import { ToastHost } from './ToastHost';

interface Destination {
  to: '/' | '/expenses' | '/emergency' | '/household' | '/settings' | '/more';
  icon: IconName;
  label: MessageKey;
  /** Paths that belong to this destination besides its own. */
  also: string[];
}

const HOME: Destination = { to: '/', icon: 'home', label: 'nav.home', also: ['/pets'] };
const EXPENSES: Destination = { to: '/expenses', icon: 'wallet', label: 'nav.expenses', also: [] };
const EMERGENCY: Destination = {
  to: '/emergency',
  icon: 'shield',
  label: 'nav.emergency',
  also: [],
};
const HOUSEHOLD: Destination = {
  to: '/household',
  icon: 'users',
  label: 'nav.household',
  also: [],
};
const SETTINGS: Destination = {
  to: '/settings',
  icon: 'sliders',
  label: 'nav.settings',
  also: ['/contacts', '/sync'],
};
const MORE: Destination = {
  to: '/more',
  icon: 'more',
  label: 'nav.more',
  also: ['/household', '/settings', '/contacts', '/sync'],
};

const isCurrent = (dest: Destination, pathname: string) =>
  dest.to === '/'
    ? pathname === '/' || dest.also.some((p) => pathname.startsWith(p))
    : pathname === dest.to || dest.also.some((p) => pathname.startsWith(p));

/**
 * The frame around every signed-in page. A phone gets a bottom bar with a centre + that opens the
 * Log sheet; from 860 px a top nav with a Log button. Only one of the two is ever in the page,
 * so there is exactly one Log control per viewport (QA-27).
 */
export function AppShell(): ReactNode {
  const demo = useDemo();
  const wide = useWideScreen();
  const { pathname } = useLocation();
  const logSheet = useLogSheet();
  const canLog = useCan('create', 'measurement');

  const destinations = wide
    ? [HOME, EXPENSES, EMERGENCY, HOUSEHOLD, SETTINGS]
    : [HOME, EXPENSES, null, EMERGENCY, MORE];

  const link = (dest: Destination) => (
    <Link
      key={dest.to}
      to={dest.to}
      className="lnk"
      aria-current={isCurrent(dest, pathname) ? 'page' : undefined}
    >
      <Icon name={dest.icon} />
      <span>{t(dest.label)}</span>
    </Link>
  );

  const logButton = (
    <button
      type="button"
      data-testid="log-open"
      className={wide ? 'btn primary' : 'lnk log'}
      aria-label={t('log.open')}
      onClick={() => logSheet.open()}
    >
      <Icon name="plus" />
      {wide ? <span>{t('log.openShort')}</span> : null}
    </button>
  );

  return (
    <div className="app">
      <a href="#content" className="skip">
        {t('app.skipToContent')}
      </a>
      {demo ? <DemoBanner /> : null}
      <div className="shell">
        <div className="chrome">
          <div className="topbar">
            <span className="brand">
              <span className="logo">
                <Icon name="paw" />
              </span>
              {t('app.name')}
            </span>
            {demo ? null : <SyncIndicator />}
          </div>
          <nav className="nav" aria-label={t('nav.main')}>
            <div className="links">
              {destinations.map((dest) =>
                dest ? link(dest) : canLog ? <Fragment key="log">{logButton}</Fragment> : null,
              )}
            </div>
          </nav>
          {wide && canLog ? <div className="foot">{logButton}</div> : null}
        </div>
        <main id="content" className="main">
          <Outlet />
        </main>
      </div>
      <LogSheet />
      <ToastHost />
    </div>
  );
}
