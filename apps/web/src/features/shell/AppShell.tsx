import { Link, Outlet } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { activeHousehold, useSessionStore } from '../../state/session';
import { SignOutButton } from '../sync/SignOutButton';
import { SyncIndicator } from '../sync/SyncIndicator';

const tabs: { to: string; label: MessageKey }[] = [
  { to: '/', label: 'nav.today' },
  { to: '/pets', label: 'nav.pets' },
  { to: '/expenses', label: 'nav.expenses' },
  { to: '/household', label: 'nav.household' },
  { to: '/settings', label: 'nav.settings' },
];

/** Bottom tab bar on phones, left rail from 1024 px. The sync indicator is always visible. */
export function AppShell(): ReactNode {
  const householdName = useSessionStore((s) => activeHousehold(s)?.name ?? '');
  const userName = useSessionStore((s) => s.user?.name ?? '');

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:p-2"
      >
        {t('app.skipToContent')}
      </a>
      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-10 print:hidden flex border-t border-line bg-card lg:static lg:w-52 lg:flex-col lg:border-r lg:border-t-0 lg:p-3"
      >
        {tabs.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={{ exact: tab.to === '/' }}
            className="flex min-h-14 flex-1 items-center justify-center px-2 text-sm lg:min-h-11 lg:flex-none lg:justify-start lg:rounded-lg"
            activeProps={{
              className: 'font-semibold text-brand underline',
              'aria-current': 'page',
            }}
          >
            {t(tab.label)}
          </Link>
        ))}
      </nav>
      <div className="flex flex-1 flex-col pb-16 lg:pb-0">
        <header className="flex flex-wrap print:hidden items-center justify-between gap-2 border-b border-line bg-card px-4 py-2">
          <div>
            <p className="font-semibold">{t('app.name')}</p>
            {householdName ? <p className="text-sm text-muted">{householdName}</p> : null}
          </div>
          <SyncIndicator />
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted sm:inline">
              {t('auth.signedInAs', { name: userName })}
            </span>
            <Link to="/sync" className="inline-flex min-h-11 items-center underline">
              {t('nav.sync')}
            </Link>
            <SignOutButton />
          </div>
        </header>
        <main id="content" className="flex-1 p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
