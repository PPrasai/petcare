import { Link } from '@tanstack/react-router';
import { t } from '../../i18n/t';
import type { MessageKey } from '../../i18n/en';
import { useSessionStore } from '../../state/session';
import { Card, Icon } from '../../ui';
import type { IconName } from '../../ui';
import { useDemo } from '../shared/demo';
import { SignOutButton } from '../sync/SignOutButton';

const ROWS: {
  to: '/household' | '/settings' | '/contacts' | '/sync';
  icon: IconName;
  title: MessageKey;
  hint: MessageKey;
}[] = [
  { to: '/household', icon: 'users', title: 'nav.household', hint: 'more.householdHint' },
  { to: '/settings', icon: 'sliders', title: 'nav.settings', hint: 'more.settingsHint' },
  { to: '/contacts', icon: 'vet', title: 'contacts.title', hint: 'more.contactsHint' },
  { to: '/sync', icon: 'note', title: 'nav.sync', hint: 'more.syncHint' },
];

/** The phone's fifth tab: everything that is not in the bottom bar. */
export function MorePage() {
  const user = useSessionStore((s) => s.user);
  const demo = useDemo();
  return (
    <>
      <div className="greet">
        <h1>{t('nav.more')}</h1>
        {user ? <p className="lede">{t('auth.signedInAs', { name: user.name })}</p> : null}
      </div>
      <Card pad={false} style={{ padding: '4px 18px' }}>
        {ROWS.map((row) => (
          <Link key={row.to} to={row.to} className="mrow">
            <span style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <span className="muted">
                <Icon name={row.icon} />
              </span>
              <span className="l">
                <b>{t(row.title)}</b>
                <span>{t(row.hint)}</span>
              </span>
            </span>
            <span className="muted">
              <Icon name="next" />
            </span>
          </Link>
        ))}
      </Card>
      {demo ? null : (
        <div className="acts">
          <SignOutButton />
        </div>
      )}
    </>
  );
}
