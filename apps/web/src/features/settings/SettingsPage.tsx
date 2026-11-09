import { Link } from '@tanstack/react-router';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { useDemo } from '../shared/demo';
import { SignOutButton } from '../sync/SignOutButton';
import { AccountsPanel } from './AccountsPanel';
import { CalendarPanel } from './CalendarPanel';
import { DataPanel } from './DataPanel';
import { NotificationsPanel } from './NotificationsPanel';
import { PreferencesPanel } from './PreferencesPanel';

/** Everything the user can change about themselves (CAP-19, CAP-20). */
export function SettingsPage() {
  const user = useSessionStore((s) => s.user);
  const demo = useDemo();
  return (
    <div className="flex max-w-xl flex-col gap-8">
      <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
      {user ? (
        <section aria-labelledby="profile-title" className="flex flex-col gap-1">
          <h2 id="profile-title" className="text-xl font-semibold">
            {t('settings.profile')}
          </h2>
          <p>{user.name}</p>
          <p className="text-muted">{user.email}</p>
        </section>
      ) : null}
      <PreferencesPanel />
      <NotificationsPanel />
      <CalendarPanel />
      <AccountsPanel />
      <DataPanel />
      <Link to="/contacts" className="underline">
        {t('contacts.title')}
      </Link>
      <Link to="/sync" className="underline">
        {t('nav.sync')}
      </Link>
      {demo ? null : (
        <div className="acts">
          <SignOutButton />
        </div>
      )}
    </div>
  );
}
