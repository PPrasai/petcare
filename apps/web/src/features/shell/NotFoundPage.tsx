import { Link } from '@tanstack/react-router';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { EmptyState } from '../../ui';
import { useWideScreen } from '../shared/use-wide-screen';
import { AppShell } from './AppShell';

/** An unknown address: inside the shell when signed in, on its own page otherwise. */
export function NotFoundPage() {
  const signedIn = useSessionStore((s) => s.status === 'signedIn');
  const wide = useWideScreen();
  const body = (
    <EmptyState
      icon="paw"
      title={t('notFound.title')}
      headingLevel={1}
      action={
        <Link to="/" className="btn primary">
          {t('notFound.home')}
        </Link>
      }
    >
      {t('notFound.body')}
    </EmptyState>
  );
  // From 860 px the shell's panel grid holds it as its single panel (S-05).
  const framed = wide ? (
    <div className="two" data-layout="single">
      <div className="card" data-area="notfound">
        {body}
      </div>
    </div>
  ) : (
    body
  );
  return signedIn ? <AppShell>{framed}</AppShell> : <main className="authwrap">{body}</main>;
}
