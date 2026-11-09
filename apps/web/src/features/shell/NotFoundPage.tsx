import { Link } from '@tanstack/react-router';
import { t } from '../../i18n/t';
import { useSessionStore } from '../../state/session';
import { EmptyState } from '../../ui';
import { AppShell } from './AppShell';

/** An unknown address: inside the shell when signed in, on its own page otherwise. */
export function NotFoundPage() {
  const signedIn = useSessionStore((s) => s.status === 'signedIn');
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
  return signedIn ? <AppShell>{body}</AppShell> : <main className="authwrap">{body}</main>;
}
