import {
  type AsyncRouteComponent,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
} from '@tanstack/react-router';
import { AuthPage } from '../features/auth/AuthPage';
import { PublicEmergencyPage } from '../features/emergency/PublicEmergencyPage';
import { JoinPage } from '../features/household/JoinPage';
import { pendingInvite } from '../lib/pending-invite';
import { NewPetPage } from '../features/pets/NewPetPage';
import { HomePage } from '../features/home/HomePage';
import { parseTab } from '../features/pets/profile-tabs';
import { WIDE_QUERY } from '../features/shared/use-wide-screen';
import { MorePage } from '../features/shell/MorePage';
import { NotFoundPage } from '../features/shell/NotFoundPage';
import { AppShell } from '../features/shell/AppShell';
import { useSessionStore } from '../state/session';

// These screens are separate chunks, so the first paint does not wait for them. The service worker
// still precaches every chunk, so each opens offline too (QA-36, DIS-petcare-006).
const EmergencyPage = lazyRouteComponent(
  () => import('../features/emergency/EmergencyPage'),
  'EmergencyPage',
);
const ContactsPage = lazyRouteComponent(
  () => import('../features/contacts/ContactsPage'),
  'ContactsPage',
);
const ExpensesPage = lazyRouteComponent(
  () => import('../features/expenses/ExpensesPage'),
  'ExpensesPage',
);
const HouseholdPage = lazyRouteComponent(
  () => import('../features/household/HouseholdPage'),
  'HouseholdPage',
);
const SettingsPage = lazyRouteComponent(
  () => import('../features/settings/SettingsPage'),
  'SettingsPage',
);
const SyncPage = lazyRouteComponent(() => import('../features/sync/SyncPage'), 'SyncPage');

const signedIn = () => useSessionStore.getState().status === 'signedIn';

const root = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFoundPage,
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

const leaf = <P extends string>(
  path: P,
  component: (() => React.ReactNode) | AsyncRouteComponent<unknown>,
) => createRoute({ getParentRoute: () => app, path, component });

const home = createRoute({
  getParentRoute: () => app,
  path: '/',
  beforeLoad: () => {
    // An invite link opened before signing in is picked up right after.
    if (pendingInvite()) throw redirect({ to: '/join' });
  },
  component: () => <HomePage />,
});
// The old pet list: kept so bookmarks and push links still land somewhere sensible.
const pets = createRoute({
  getParentRoute: () => app,
  path: '/pets',
  beforeLoad: () => {
    throw redirect({ to: '/' });
  },
});
const newPet = leaf('/pets/new', NewPetPage);
const petDetail = createRoute({
  getParentRoute: () => app,
  path: '/pets/$petId',
  // `emergency` was a tab; it is a page now, so the old value is kept long enough to redirect.
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === 'emergency' ? ('emergency' as const) : parseTab(search.tab),
  }),
  beforeLoad: ({ params, search }) => {
    if (search.tab === 'emergency') {
      throw redirect({ to: '/emergency', search: { pet: params.petId } });
    }
  },
  component: function PetRoute() {
    const { petId } = petDetail.useParams();
    const { tab } = petDetail.useSearch();
    return <HomePage petId={petId} tab={tab === 'emergency' ? 'overview' : tab} />;
  },
});
const emergency = createRoute({
  getParentRoute: () => app,
  path: '/emergency',
  validateSearch: (search: Record<string, unknown>) => ({
    pet: typeof search.pet === 'string' ? search.pet : undefined,
  }),
  component: function EmergencyRoute() {
    return <EmergencyPage petId={emergency.useSearch().pet} />;
  },
});
const more = createRoute({
  getParentRoute: () => app,
  path: '/more',
  beforeLoad: () => {
    // The desktop top nav has Household and Settings itself, so there is no More page there.
    if (window.matchMedia(WIDE_QUERY).matches) throw redirect({ to: '/settings' });
  },
  component: MorePage,
});
const expenses = leaf('/expenses', ExpensesPage);
const contacts = leaf('/contacts', ContactsPage);
const household = leaf('/household', HouseholdPage);
const settings = leaf('/settings', SettingsPage);
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

const publicEmergency = createRoute({
  getParentRoute: () => root,
  path: '/e/$token',
  component: function EmergencyRoute() {
    return <PublicEmergencyPage token={publicEmergency.useParams().token} />;
  },
});

const routeTree = root.addChildren([
  app.addChildren([
    home,
    pets,
    newPet,
    petDetail,
    emergency,
    more,
    expenses,
    contacts,
    household,
    settings,
    syncActivity,
  ]),
  createRoute({ getParentRoute: () => root, path: '/join', component: JoinPage }),
  publicEmergency,
  publicRoute('/sign-in', 'signIn'),
  publicRoute('/sign-up', 'signUp'),
]);

export const router = createRouter({ routeTree, defaultPreload: false });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
