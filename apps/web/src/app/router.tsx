import {
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { AuthPage } from '../features/auth/AuthPage';
import { ContactsPage } from '../features/contacts/ContactsPage';
import { ExpensesPage } from '../features/expenses/ExpensesPage';
import { HouseholdPage } from '../features/household/HouseholdPage';
import { JoinPage } from '../features/household/JoinPage';
import { pendingInvite } from '../lib/pending-invite';
import { NewPetPage } from '../features/pets/NewPetPage';
import { PetDetailPage, parseTab } from '../features/pets/PetDetailPage';
import { PetsPage } from '../features/pets/PetsPage';
import { NotificationsPanel } from '../features/settings/NotificationsPanel';
import { AppShell } from '../features/shell/AppShell';
import { SimplePage } from '../features/shared/SimplePage';
import { TodayPage } from '../features/today/TodayPage';
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

const leaf = <P extends string>(path: P, component: () => React.ReactNode) =>
  createRoute({ getParentRoute: () => app, path, component });

const today = createRoute({
  getParentRoute: () => app,
  path: '/',
  beforeLoad: () => {
    // An invite link opened before signing in is picked up right after.
    if (pendingInvite()) throw redirect({ to: '/join' });
  },
  component: TodayPage,
});
const pets = leaf('/pets', PetsPage);
const newPet = leaf('/pets/new', NewPetPage);
const petDetail = createRoute({
  getParentRoute: () => app,
  path: '/pets/$petId',
  validateSearch: (search: Record<string, unknown>) => ({ tab: parseTab(search.tab) }),
  component: function PetRoute() {
    const { petId } = petDetail.useParams();
    const { tab } = petDetail.useSearch();
    return <PetDetailPage petId={petId} tab={tab} />;
  },
});
const expenses = leaf('/expenses', ExpensesPage);
const contacts = leaf('/contacts', ContactsPage);
const household = leaf('/household', HouseholdPage);
const settings = leaf('/settings', () => (
  <SimplePage title={t('settings.title')}>
    <NotificationsPanel />
    <Link to="/contacts" className="underline">
      {t('contacts.title')}
    </Link>
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
  app.addChildren([
    today,
    pets,
    newPet,
    petDetail,
    expenses,
    contacts,
    household,
    settings,
    syncActivity,
  ]),
  createRoute({ getParentRoute: () => root, path: '/join', component: JoinPage }),
  publicRoute('/sign-in', 'signIn'),
  publicRoute('/sign-up', 'signUp'),
]);

export const router = createRouter({ routeTree, defaultPreload: false });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
