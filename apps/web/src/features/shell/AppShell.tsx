import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { t } from '../../i18n/t';
import { Icon } from '../../ui';
import { LogSheet } from '../log/LogSheet';
import { useLogSheet } from '../log/log-sheet';
import { useCan } from '../shared/permissions';
import { useDemo } from '../shared/demo';
import { useWideScreen } from '../shared/use-wide-screen';
import { SyncIndicator } from '../sync/SyncIndicator';
import { DemoBanner } from './DemoBanner';
import { EMERGENCY, EXPENSES, HOME, MORE, isCurrent, openPetId } from './destinations';
import type { Destination } from './destinations';
import { Sidebar } from './Sidebar';
import { ToastHost } from './ToastHost';
import { useSidebarState } from './use-sidebar-state';

/**
 * The frame around every signed-in page. A phone gets a bottom bar with a centre + that opens the
 * Log sheet; from 860 px a sidebar with the Log button (SPEC-petcare-004). Only one of the two is
 * ever in the page, so there is exactly one Log control per viewport (QA-27). `children` replaces
 * the routed page, which is how the not-found page sits inside the shell.
 */
export function AppShell({ children }: { children?: ReactNode }): ReactNode {
  const demo = useDemo();
  const wide = useWideScreen();
  const { pathname } = useLocation();
  const logSheet = useLogSheet();
  const canLog = useCan('create', 'measurement');
  const sidebar = useSidebarState();

  if (wide) {
    // One grid, locked to the window: the sidebar, then the banner above the content column.
    return (
      <div className="app" data-sidebar={sidebar.collapsed ? 'collapsed' : 'expanded'}>
        <a href="#content" className="skip">
          {t('app.skipToContent')}
        </a>
        <div className="shell">
          <Sidebar collapsed={sidebar.collapsed} onToggle={sidebar.toggle} />
          {demo ? <DemoBanner /> : null}
          <main id="content" className="main">
            {children ?? <Outlet />}
          </main>
        </div>
        <LogSheet />
        <ToastHost />
      </div>
    );
  }

  const destinations = [HOME, EXPENSES, null, EMERGENCY, MORE];

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
      className="lnk log"
      aria-label={t('log.open')}
      onClick={() => {
        const petId = openPetId(pathname);
        logSheet.open(petId ? { petId } : {});
      }}
    >
      <Icon name="plus" />
    </button>
  );

  return (
    <div className="app">
      <a href="#content" className="skip">
        {t('app.skipToContent')}
      </a>
      {demo ? <DemoBanner /> : null}
      <div className={`shell${pathname === '/pets/new' ? ' noNav' : ''}`}>
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
        </div>
        <main id="content" className="main">
          {children ?? <Outlet />}
        </main>
      </div>
      <LogSheet />
      <ToastHost />
    </div>
  );
}
