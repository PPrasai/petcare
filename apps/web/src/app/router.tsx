import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { AuthPage } from '../features/auth/AuthPage';
import { PetsPage } from '../features/pets/PetsPage';
import { AppShell } from '../features/shell/AppShell';
import { SimplePage } from '../features/shared/SimplePage';
import { SyncPage } from '../features/sync/SyncPage';
import { t } from '../i18n/t';
import { useSessionStore } from '../state/session';

const signedIn = () => useSessionStore.getState().status === 'signedIn';

const root = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <main className="mx-auto flex max-w-md flex-col gap-3 p-6">
      <h1 className="text-2xl font-semibold">{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <Link to="/" className="underline">
        {t('notFound.home')}
      </Link>
    </main>
  ),
});

/** Everything behind sign-in shares the shell (navigation, sync indicator). */
const app = createRoute({
  getParentRoute: () => root,
  id: 'app',
  beforeLoad: () => {
    if (!signedIn()) throw redirect({ to: '/sign-in' });
  },
  component: AppShell,
});

const leaf = (path: string, component: () => React.ReactNode) =>
  createRoute({ getParentRoute: () => app, path, component });

const today = leaf('/', () => (
  <SimplePage title={t('today.title')}>
    <p>{t('today.placeholder')}</p>
  </SimplePage>
));
const pets = leaf('/pets', PetsPage);
const expenses = leaf('/expenses', () => (
  <SimplePage title={t('expenses.title')}>
    <p>{t('expenses.placeholder')}</p>
  </SimplePage>
));
const household = leaf('/household', () => (
  <SimplePage title={t('household.title')}>
    <p>{t('household.current', { name: useSessionStore.getState().households[0]?.name ?? '' })}</p>
  </SimplePage>
));
const settings = leaf('/settings', () => (
  <SimplePage title={t('settings.title')}>
    <p>{t('settings.placeholder')}</p>
  </SimplePage>
));
const syncActivity = leaf('/sync', SyncPage);

const publicRoute = (path: '/sign-in' | '/sign-up', mode: 'signIn' | 'signUp') =>
  createRoute({
    getParentRoute: () => root,
    path,
    beforeLoad: () => {
      if (signedIn()) throw redirect({ to: '/' });
    },
    component: () => <AuthPage mode={mode} />,
  });

const routeTree = root.addChildren([
  app.addChildren([today, pets, expenses, household, settings, syncActivity]),
  publicRoute('/sign-in', 'signIn'),
  publicRoute('/sign-up', 'signUp'),
]);

export const router = createRouter({ routeTree, defaultPreload: false });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
