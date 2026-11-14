import { Link } from '@tanstack/react-router';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { useSessionStore } from '../../state/session';
import { Banner, Card, Icon, PageHeader, SectionHeader } from '../../ui';
import { useDemo } from '../shared/demo';
import { SignOutButton } from '../sync/SignOutButton';
import { SignInCard } from './AccountsPanel';
import { CalendarRow } from './CalendarPanel';
import { DataCard } from './DataPanel';
import { PushRow } from './NotificationsPanel';
import { PreferencesPanel } from './PreferencesPanel';

const DEMO_NOTE = 'settings-demo';

const LINKS: {
  to: '/household' | '/contacts' | '/sync';
  title: MessageKey;
  hint: MessageKey;
}[] = [
  { to: '/household', title: 'nav.household', hint: 'more.householdHint' },
  { to: '/contacts', title: 'contacts.title', hint: 'more.contactsHint' },
  { to: '/sync', title: 'nav.sync', hint: 'more.syncHint' },
];

/** Everything the user can change about themselves (CAP-19, CAP-20). */
export function SettingsPage() {
  const user = useSessionStore((s) => s.user);
  const demo = useDemo();
  return (
    <>
      <PageHeader
        title={t('settings.title')}
        {...(user ? { lede: t('settings.lede', { name: user.name, email: user.email }) } : {})}
      />
      {demo ? <Banner id={DEMO_NOTE}>{t('settings.demo')}</Banner> : null}
      <div className="two">
        <div className="stack">
          <Card>
            <PushRow demoNoteId={DEMO_NOTE} />
            <CalendarRow demoNoteId={DEMO_NOTE} />
          </Card>
          <PreferencesPanel />
        </div>
        <div className="stack">
          <SignInCard demoNoteId={DEMO_NOTE} />
          <DataCard demoNoteId={DEMO_NOTE} />
          <Card>
            <SectionHeader title={t('settings.more')} />
            {LINKS.map((row) => (
              <Link key={row.to} to={row.to} className="mrow">
                <span className="l">
                  <b>{t(row.title)}</b>
                  <span>{t(row.hint)}</span>
                </span>
                <span className="muted">
                  <Icon name="next" />
                </span>
              </Link>
            ))}
          </Card>
          {demo ? null : <SignOutButton />}
        </div>
      </div>
    </>
  );
}
