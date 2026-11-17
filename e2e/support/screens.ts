import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import {
  addPet,
  addReminder,
  createInvite,
  openDisclosure,
  shareEmergencyCard,
  signUp,
  waitSynced,
} from './app';

/**
 * The table of screen states that QA-39 (axe), QA-40 (layout) and QA-32 walk. One entry per
 * in-scope row of SPEC-petcare-003 §5.1, plus each sheet and dialog. A later slice adds its rows
 * here and nothing else changes. Rows still in the increment-1 layout (listed in
 * scripts/pebble-legacy-allow.json) are added by the slice that converts them.
 */
export type Session = 'none' | 'demo' | 'account';

export interface Screen {
  /** The §5.1 ID, with a suffix for a state of that row, for example `S-04 lost`. */
  id: string;
  /** An address, or a function that makes one (for example by creating data first). */
  path: string | ((browser: Browser) => Promise<string>);
  session: Session;
  /** Waits until the state has loaded. */
  ready: (page: Page) => Promise<void>;
  /** Opens a sheet or dialog, or reaches a state, after the page loaded. */
  open?: (page: Page, browser: Browser) => Promise<void>;
  /** The widths it exists at (More is a phone page). All three when left out. */
  widths?: (390 | 900 | 1280)[];
  /** `overlay` is a sheet or dialog: QA-40 checks overflow, fonts and hit areas only. */
  kind?: 'page' | 'overlay';
  /** A two-column screen: its `.two` has two tracks at 1280 and one at 390. */
  two?: boolean;
  /** From 860 px: the `data-layout` of its panel grid (SPEC-petcare-004 5.5). */
  desk?: { layout: string };
}

const heading =
  (name: string | RegExp, level = 1) =>
  async (page: Page) => {
    await expect(page.getByRole('heading', { level, name })).toBeVisible();
  };

/** The wizard's step heading is the page h1 on a phone and a panel h2 from 860 px. */
const wizardReady = async (page: Page) => {
  await expect(page.getByRole('heading', { name: 'Meet your newest family member' })).toBeVisible();
};

/** A pet's profile: a row opens it on a phone; from 860 px it already sits beside the list. */
const profile = async (page: Page) => {
  const tabs = page.getByRole('tablist');
  if (!(await tabs.isVisible()))
    await page.getByTestId('pet-row').filter({ hasText: 'Momo' }).click();
  await expect(tabs).toBeVisible();
};

const logSheet = (page: Page) => page.getByRole('dialog', { name: 'Log something' });
const openLog = async (page: Page) => {
  await page.getByTestId('log-open').click();
  await expect(logSheet(page)).toBeVisible();
};
const logKind = (index: number) => async (page: Page) => {
  await openLog(page);
  await logSheet(page).locator('.types button').nth(index).click();
  // From 860 px the dialog keeps its own title above the form's, so the form's is the last one.
  await expect(logSheet(page).getByRole('heading', { level: 2 }).last()).not.toHaveText(
    'Log something',
  );
};

const dialogNamed = (name: string | RegExp) => (page: Page) => page.getByRole('dialog', { name });

/** A real 1x1 PNG, so the server's content sniffing accepts it as a receipt. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Adds an expense through the full sheet on /expenses. */
const addExpense = async (page: Page, amount: string, currency: string, receipt = false) => {
  await page.getByRole('button', { name: /^Add (an )?expense$/ }).click();
  await page.getByLabel('Amount').fill(amount);
  await page.getByLabel('Currency').fill(currency);
  if (receipt) {
    await page
      .getByLabel('Receipt (optional)')
      .setInputFiles({ name: 'receipt.png', mimeType: 'image/png', buffer: PNG });
  }
  await dialogNamed('Add expense')(page).getByRole('button', { name: 'Add expense' }).click();
  await expect(dialogNamed('Add expense')(page)).toBeHidden();
};

/** Types a name on step 1 of the add-pet wizard and continues to the step. */
const wizardStep = (step: 2 | 3) => async (page: Page) => {
  await page.getByLabel('Name', { exact: true }).fill('Momo');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'A few details' })).toBeVisible();
  if (step === 2) return;
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Reminders for Momo' })).toBeVisible();
};

const membersLoaded = async (page: Page) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Household' })).toBeVisible();
  await expect(page.getByTestId('member-row').first()).toBeVisible();
};

// A second person joins the matrix account's household once per session, for the member sheet.
const guests = new WeakSet<Page>();
const withGuest = async (page: Page, browser: Browser) => {
  if (!guests.has(page)) {
    await createInvite(page);
    const code = (await page.getByTestId('invite-code').textContent()) ?? '';
    const context = await browser.newContext({ baseURL: 'http://localhost:4173' });
    try {
      const guest = await context.newPage();
      await signUp(guest, 'guest');
      await guest.goto('/join');
      await guest.getByLabel('Invite code').fill(code.toLowerCase());
      await guest.getByRole('button', { name: 'Check code' }).click();
      await guest.getByRole('button', { name: 'Join household' }).click();
      await expect(guest.getByRole('navigation', { name: 'Main' })).toBeVisible();
    } finally {
      await context.close();
    }
    guests.add(page);
    await page.reload();
    await membersLoaded(page);
  }
};
const manageGuest = async (page: Page, browser: Browser) => {
  await withGuest(page, browser);
  await page.getByRole('button', { name: 'Manage guest Person' }).click();
  await expect(dialogNamed('guest Person')(page)).toBeVisible();
};

/** A well-formed invite token, so /join shows its signed-out invite wording. */
const INVITE_TOKEN = 'A'.repeat(43);

// Public emergency pages need data: one account per variant, made the first time it is asked for.
const publicCards = new Map<string, Promise<string>>();
const publicCard = (lost: boolean) => (browser: Browser) => {
  const key = lost ? 'lost' : 'normal';
  let made = publicCards.get(key);
  if (!made) {
    made = shareEmergencyCard(browser, { lost });
    publicCards.set(key, made);
  }
  return made;
};

// P1b-3: Settings, Sync activity and the Emergency hub. A pet and its card are made once per session.
const pets = new WeakSet<Page>();
const cards = new WeakSet<Page>();
const withPet = async (page: Page) => {
  if (!pets.has(page)) {
    await addPet(page, 'Momo');
    pets.add(page);
    await page.goto('/emergency');
  }
};

/** The profile of the demo pet (Home on the phone, beside the list from 860 px), on one tab. */
const profileTab = (tab: string) => async (page: Page) => {
  await profile(page);
  await page.getByRole('tab', { name: tab, exact: true }).click();
};
const profileDetails = async (page: Page) => {
  await profile(page);
  await openDisclosure(page, 'Details');
};
/** A pet's profile in a fresh account, on one tab. */
const newPetTab = (tab: string) => async (page: Page) => {
  await withPet(page);
  await page.goto('/');
  await profileTab(tab)(page);
};
const profileOpener =
  (tab: string, button: string, dialog: string, disclosure?: string) => async (page: Page) => {
    await profileTab(tab)(page);
    if (disclosure) await openDisclosure(page, disclosure);
    await page.getByRole('button', { name: button }).click();
    await expect(dialogNamed(dialog)(page)).toBeVisible();
  };
const sidebarReady = async (page: Page) => {
  await expect(page.getByRole('complementary', { name: 'Sidebar' })).toBeVisible();
};
const mainReady = async (page: Page) => {
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
};
const withCard = async (page: Page) => {
  await withPet(page);
  if (cards.has(page)) return;
  await page.getByRole('button', { name: 'Set up card' }).click();
  await page.getByLabel('My phone number', { exact: true }).check();
  await page.getByLabel('Phone number to show').fill('+1 555 0100');
  await page.getByLabel('Notes', { exact: true }).check();
  await page.getByLabel('Notes for a finder').fill('Shy, will hide');
  await page.getByRole('button', { name: 'Save card' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Saved.' })).toBeVisible();
  await waitSynced(page);
  cards.add(page);
};
const settingsReady = async (page: Page) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Push reminders' })).toBeVisible();
};
const calendarSwitch = (page: Page) => page.getByRole('switch', { name: 'Calendar feed' });
const emergencyReady = async (page: Page) => {
  await expect(page.getByRole('heading', { level: 1, name: 'Emergency card' })).toBeVisible();
  await expect(page.getByText('Microchip').first()).toBeVisible();
};
const markLost = (page: Page) => page.getByRole('button', { name: /^Mark .+ as lost$/ });

export const SCREENS: Screen[] = [
  // P1b-1: account and public pages
  { id: 'S-01', path: '/sign-in', session: 'none', ready: heading('Sign in') },
  { id: 'S-02', path: '/sign-up', session: 'none', ready: heading('Create your account') },
  { id: 'S-03 signed out', path: '/join', session: 'none', ready: heading('Join a household') },
  {
    id: 'S-03 signed out with link',
    path: `/join#${INVITE_TOKEN}`,
    session: 'none',
    ready: async (page) => {
      await expect(
        page.getByText('Sign in or create an account to use your invite.'),
      ).toBeVisible();
    },
  },
  {
    id: 'S-03 signed in',
    path: '/join',
    session: 'account',
    ready: async (page) => {
      await expect(page.getByRole('button', { name: 'Check code' })).toBeVisible();
    },
  },
  {
    id: 'S-04 gone',
    path: `/e/${'x'.repeat(43)}`,
    session: 'none',
    ready: async (page) => {
      await expect(page.getByText('This link is no longer active.')).toBeVisible();
    },
  },
  { id: 'S-04 normal', path: publicCard(false), session: 'none', ready: heading('Momo') },
  {
    id: 'S-04 lost',
    path: publicCard(true),
    session: 'none',
    ready: async (page) => {
      await expect(page.getByRole('alert').filter({ hasText: 'This pet is lost' })).toBeVisible();
    },
  },
  {
    id: 'S-05 signed out',
    path: '/no-such-page',
    session: 'none',
    ready: heading('Page not found'),
  },
  {
    id: 'S-05 in the shell',
    path: '/no-such-page',
    session: 'demo',
    ready: heading('Page not found'),
    desk: { layout: 'single' },
  },

  // SPEC-petcare-004 D1: Home's first run (before the account has a pet), then the shell states.
  {
    id: 'S-10 first run',
    path: '/',
    session: 'account',
    ready: async (page) => {
      await expect(page.locator('.empty').getByText(/^Add your first pet/)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Add a pet' }).first()).toBeVisible();
    },
    desk: { layout: 'single' },
  },
  ...(['expanded', 'collapsed'] as const).map((state): Screen => ({
    id: `S-06 ${state}`,
    path: '/',
    session: 'account',
    widths: [900, 1280],
    ready: sidebarReady,
    open: async (page) => {
      await page.evaluate((value) => localStorage.setItem('pc:sidebar', value), state);
      await page.reload();
      await sidebarReady(page);
      await expect(page.locator('.app')).toHaveAttribute('data-sidebar', state);
    },
    desk: { layout: 'single' },
  })),
  {
    id: 'S-06 offline',
    path: '/',
    session: 'account',
    widths: [900, 1280],
    ready: sidebarReady,
    open: async (page) => {
      await page.context().setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await expect(page.getByTestId('connectivity')).toHaveText('Offline');
    },
    desk: { layout: 'single' },
  },
  {
    id: 'S-07',
    path: '/',
    session: 'demo',
    ready: async (page) => {
      await expect(page.getByRole('region', { name: 'Demo mode' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Reset demo' })).toBeVisible();
    },
    desk: { layout: 'home' },
  },

  // Already Pebble (P1, P2): shell, demo banner, toast, Log sheet, Home, profile header, More
  {
    id: 'S-10',
    path: '/',
    session: 'demo',
    ready: async (page) => {
      await expect(page.getByRole('region', { name: 'Demo mode' })).toBeVisible();
      await expect(page.getByTestId('pet-row').first()).toBeVisible();
    },
    desk: { layout: 'home' },
  },
  {
    id: 'S-09 chooser',
    path: '/',
    session: 'demo',
    kind: 'overlay',
    ready: async (page) => {
      await expect(page.getByTestId('pet-row').first()).toBeVisible();
    },
    open: openLog,
  },
  ...[
    ['meal', 0],
    ['walk', 1],
    ['medication', 2],
    ['grooming', 3],
    ['weight', 4],
    ['note', 5],
    ['expense', 6],
    ['vet visit', 7],
    ['photo', 8],
  ].map(([kind, index]): Screen => ({
    id: `S-09 ${kind}`,
    path: '/',
    session: 'demo',
    kind: 'overlay',
    ready: async (page) => {
      await expect(page.getByTestId('pet-row').first()).toBeVisible();
    },
    open: logKind(index as number),
  })),
  {
    id: 'S-11 overview',
    path: '/',
    session: 'demo',
    two: true,
    desk: { layout: 'overview' },
    ready: profile,
  },
  {
    id: 'S-12 menu',
    path: '/',
    session: 'demo',
    two: true,
    desk: { layout: 'overview' },
    ready: profile,
    open: async (page) => {
      await page
        .getByLabel(/^More actions: /)
        .first()
        .click();
      await expect(page.getByRole('button', { name: 'Snooze 1 hour' }).first()).toBeVisible();
    },
  },
  {
    id: 'S-13',
    path: '/',
    session: 'demo',
    two: true,
    desk: { layout: 'overview' },
    ready: profile,
    open: async (page) => {
      await expect(page.getByRole('heading', { level: 2, name: 'Weight' })).toBeVisible();
      await expect(page.getByRole('img', { name: /^Weight/ })).toBeVisible();
    },
  },
  {
    id: 'S-48',
    path: '/',
    session: 'demo',
    two: true,
    desk: { layout: 'health' },
    ready: profile,
    open: async (page) => {
      await profileTab('Health')(page);
      await expect(page.getByRole('heading', { level: 2, name: 'Recent activity' })).toBeVisible();
    },
  },
  {
    id: 'S-17',
    path: '/more',
    session: 'demo',
    widths: [390],
    ready: heading('More'),
  },

  // P1b-2: expenses, household, contacts and the file viewer
  {
    id: 'S-24 list',
    desk: { layout: 'contacts' },
    path: '/contacts',
    session: 'demo',
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible();
      await expect(page.getByTestId('contact-row').first()).toBeVisible();
    },
  },
  {
    id: 'S-24 add sheet',
    path: '/contacts',
    session: 'demo',
    kind: 'overlay',
    ready: heading('Contacts'),
    open: async (page) => {
      await page.getByRole('button', { name: /^Add (a )?contact$/ }).click();
      await expect(dialogNamed('Add contact')(page)).toBeVisible();
    },
  },
  {
    id: 'S-18 month',
    path: '/expenses',
    session: 'demo',
    two: true,
    ready: heading('Expenses'),
    desk: { layout: 'expenses' },
  },
  {
    id: 'S-18 year, by pet open',
    desk: { layout: 'expenses' },
    path: '/expenses',
    session: 'demo',
    two: true,
    ready: heading('Expenses'),
    open: async (page) => {
      await page
        .getByRole('group', { name: 'Period' })
        .getByRole('button', { name: 'This year' })
        .click();
      await expect(page.getByTestId('expense-total').first()).toBeVisible();
      await openDisclosure(page, 'By pet');
      await expect(page.getByRole('table', { name: 'Spending by pet' })).toBeVisible();
    },
  },
  {
    id: 'S-19',
    path: '/expenses',
    session: 'demo',
    kind: 'overlay',
    ready: heading('Expenses'),
    open: async (page) => {
      await page.getByRole('button', { name: /^Add (an )?expense$/ }).click();
      await expect(dialogNamed('Add expense')(page)).toBeVisible();
    },
  },
  {
    id: 'S-20 demo',
    desk: { layout: 'household' },
    path: '/household',
    session: 'demo',
    two: true,
    ready: async (page) => {
      await expect(page.getByTestId('member-row').first()).toBeVisible();
    },
  },
  {
    id: 'S-24 empty',
    desk: { layout: 'single' },
    path: '/contacts',
    session: 'account',
    ready: async (page) => {
      await expect(page.locator('.empty').getByText(/^No contacts yet\./)).toBeVisible();
    },
  },
  {
    id: 'S-18 empty',
    desk: { layout: 'expenses' },
    path: '/expenses',
    session: 'account',
    two: true,
    ready: async (page) => {
      await expect(page.locator('.empty').getByText(/^No expenses yet\./)).toBeVisible();
    },
  },
  {
    id: 'S-16 step 1',
    desk: { layout: 'wizard' },
    path: '/pets/new',
    session: 'account',
    ready: wizardReady,
  },
  {
    id: 'S-16 step 2',
    desk: { layout: 'wizard' },
    path: '/pets/new',
    session: 'account',
    ready: wizardReady,
    open: wizardStep(2),
  },
  {
    id: 'S-16 step 3',
    desk: { layout: 'wizard' },
    path: '/pets/new',
    session: 'account',
    ready: wizardReady,
    open: wizardStep(3),
  },
  {
    id: 'S-16 step 3, reminder opened',
    desk: { layout: 'wizard' },
    path: '/pets/new',
    session: 'account',
    ready: wizardReady,
    open: async (page) => {
      await wizardStep(3)(page);
      await page
        .locator('.sugrow')
        .filter({ hasText: 'Daily walk' })
        .getByRole('button', { name: /Change/ })
        .click();
      await expect(page.getByLabel('Time')).toBeVisible();
    },
  },
  {
    id: 'S-20 owner',
    path: '/household',
    session: 'account',
    two: true,
    ready: membersLoaded,
    desk: { layout: 'household' },
  },
  {
    id: 'S-21 invite sheet',
    path: '/household',
    session: 'account',
    kind: 'overlay',
    ready: membersLoaded,
    open: async (page) => {
      await page.getByRole('button', { name: 'Invite', exact: true }).click();
      await expect(dialogNamed('Invite someone')(page)).toBeVisible();
    },
  },
  {
    id: 'S-21 new invite',
    desk: { layout: 'household' },
    path: '/household',
    session: 'account',
    two: true,
    ready: membersLoaded,
    open: async (page) => {
      await createInvite(page, 'Viewer');
      await expect(page.getByRole('region', { name: 'New invite' })).toBeVisible();
      await expect(page.getByRole('img', { name: 'QR code of the invite link' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Open invites' })).toBeVisible();
    },
  },
  {
    id: 'S-49',
    path: '/household',
    session: 'demo',
    two: true,
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 2, name: 'Recent care' })).toBeVisible();
    },
    widths: [900, 1280],
    desk: { layout: 'household' },
  },
  {
    id: 'S-22 member sheet',
    path: '/household',
    session: 'account',
    kind: 'overlay',
    ready: membersLoaded,
    open: manageGuest,
  },
  {
    id: 'S-22 transfer dialog',
    path: '/household',
    session: 'account',
    kind: 'overlay',
    ready: membersLoaded,
    open: async (page, browser) => {
      await manageGuest(page, browser);
      await page.getByRole('button', { name: 'Make guest Person the owner' }).click();
      await expect(dialogNamed('Transfer ownership')(page)).toBeVisible();
    },
  },
  {
    id: 'S-23 leave dialog',
    path: '/household',
    session: 'account',
    kind: 'overlay',
    ready: membersLoaded,
    open: async (page) => {
      await page.getByRole('button', { name: 'Leave household' }).click();
      await expect(dialogNamed('Leave this household?')(page)).toBeVisible();
    },
  },
  {
    id: 'S-23 last owner',
    path: '/household',
    session: 'account',
    kind: 'overlay',
    ready: membersLoaded,
    open: async (page) => {
      await page.getByRole('button', { name: 'Leave household' }).click();
      await page.getByRole('button', { name: 'Leave', exact: true }).click();
      await expect(
        dialogNamed('Leave this household?')(page).getByText(
          'Make another member the owner before you leave.',
        ),
      ).toBeVisible();
    },
  },
  {
    id: 'S-18 spending',
    desk: { layout: 'expenses' },
    path: '/expenses',
    session: 'account',
    two: true,
    ready: heading('Expenses'),
    open: async (page) => {
      await addExpense(page, '12.50', 'USD', true);
      await addExpense(page, '1500', 'NPR');
      await expect(page.getByTestId('expense-total')).toHaveCount(2);
      // Let the receipt upload finish, so the viewer finds the file.
      await waitSynced(page);
    },
  },
  {
    id: 'S-47',
    path: '/expenses',
    session: 'account',
    kind: 'overlay',
    ready: async (page) => {
      await expect(page.getByRole('button', { name: 'View Receipt (optional)' })).toBeVisible();
    },
    open: async (page) => {
      await page.getByRole('button', { name: 'View Receipt (optional)' }).click();
      await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
    },
  },
  // P1b-3: Settings, Sync activity and the Emergency hub
  {
    id: 'S-25 demo',
    desk: { layout: 'settings' },
    path: '/settings',
    session: 'demo',
    two: true,
    ready: settingsReady,
  },
  {
    id: 'S-32 demo',
    desk: { layout: 'sync' },
    path: '/sync',
    session: 'demo',
    two: true,
    ready: heading('Sync activity'),
  },
  {
    id: 'S-33 demo',
    desk: { layout: 'emergency' },
    path: '/emergency',
    session: 'demo',
    two: true,
    ready: emergencyReady,
  },
  {
    id: 'S-34 demo',
    path: '/emergency',
    session: 'demo',
    kind: 'overlay',
    ready: emergencyReady,
    open: async (page) => {
      await page.getByRole('button', { name: 'Edit card' }).first().click();
      await expect(dialogNamed('What a finder sees')(page)).toBeVisible();
    },
  },
  {
    id: 'S-25',
    desk: { layout: 'settings' },
    path: '/settings',
    session: 'account',
    two: true,
    ready: settingsReady,
  },
  {
    id: 'S-27',
    desk: { layout: 'settings' },
    path: '/settings',
    session: 'account',
    two: true,
    ready: settingsReady,
  },
  {
    id: 'S-26 timing open',
    desk: { layout: 'settings' },
    path: '/settings',
    session: 'account',
    two: true,
    ready: settingsReady,
    open: async (page) => {
      await page.locator('summary').filter({ hasText: 'Reminder timing' }).click();
      await expect(page.getByLabel('Minutes before: Vet visits')).toBeVisible();
    },
  },
  {
    id: 'S-28 link sheet',
    path: '/settings',
    session: 'account',
    kind: 'overlay',
    ready: settingsReady,
    open: async (page) => {
      await calendarSwitch(page).click();
      await expect(dialogNamed('Calendar')(page)).toBeVisible();
      await expect(page.getByLabel('Calendar address')).toBeVisible();
    },
  },
  {
    id: 'S-28 turn-off dialog',
    path: '/settings',
    session: 'account',
    kind: 'overlay',
    ready: async (page) => {
      await settingsReady(page);
      await expect(calendarSwitch(page)).toHaveAttribute('aria-checked', 'true');
    },
    open: async (page) => {
      await calendarSwitch(page).click();
      await expect(dialogNamed('Turn off the calendar feed?')(page)).toBeVisible();
    },
  },
  {
    id: 'S-29 password sheet',
    path: '/settings',
    session: 'account',
    kind: 'overlay',
    ready: settingsReady,
    open: async (page) => {
      await page.getByRole('button', { name: 'Change password' }).click();
      await expect(dialogNamed('Change password')(page)).toBeVisible();
    },
  },
  {
    id: 'S-30 delete dialog',
    path: '/settings',
    session: 'account',
    kind: 'overlay',
    ready: settingsReady,
    open: async (page) => {
      await page.getByRole('button', { name: 'Delete account', exact: true }).click();
      await expect(dialogNamed('Delete your account?')(page)).toBeVisible();
    },
  },
  {
    id: 'S-32',
    desk: { layout: 'sync' },
    path: '/sync',
    session: 'account',
    two: true,
    ready: async (page) => {
      await expect(page.getByRole('heading', { level: 1, name: 'Sync activity' })).toBeVisible();
      await expect(page.getByText('Nothing to review.')).toBeVisible();
    },
  },
  {
    id: 'S-33 no pet',
    desk: { layout: 'single' },
    path: '/emergency',
    session: 'account',
    ready: async (page) => {
      await expect(page.getByText(/^No pets yet\./)).toBeVisible();
    },
  },
  {
    id: 'S-33 no card',
    desk: { layout: 'emergency' },
    path: '/emergency',
    session: 'account',
    two: true,
    ready: heading('Emergency card'),
    open: async (page) => {
      await withPet(page);
      await emergencyReady(page);
      await expect(page.getByRole('button', { name: 'Set up card' })).toBeVisible();
    },
  },
  {
    id: 'S-34',
    path: '/emergency',
    session: 'account',
    kind: 'overlay',
    ready: heading('Emergency card'),
    open: async (page) => {
      await withPet(page);
      await page.getByRole('button', { name: 'Set up card' }).click();
      await expect(dialogNamed('What a finder sees')(page)).toBeVisible();
    },
  },
  {
    id: 'S-33 card saved',
    desk: { layout: 'emergency' },
    path: '/emergency',
    session: 'account',
    two: true,
    ready: heading('Emergency card'),
    open: async (page) => {
      await withCard(page);
      await page.goto('/emergency');
      await expect(page.getByText('+1 555 0100').first()).toBeVisible();
    },
  },
  {
    id: 'S-33 link created',
    desk: { layout: 'emergency' },
    path: '/emergency',
    session: 'account',
    two: true,
    ready: async (page) => {
      await expect(page.getByRole('button', { name: 'Create link' })).toBeVisible();
    },
    open: async (page) => {
      await page.getByRole('button', { name: 'Create link' }).click();
      await expect(page.getByRole('img', { name: 'QR code of the emergency link' })).toBeVisible();
      await expect(page.getByTestId('emergency-link')).toBeVisible();
    },
  },
  {
    id: 'S-35',
    path: '/emergency',
    session: 'account',
    kind: 'overlay',
    ready: async (page) => {
      await expect(markLost(page)).toBeVisible();
    },
    open: async (page) => {
      await markLost(page).click();
      await expect(dialogNamed(/^Mark .+ as lost$/)(page)).toBeVisible();
    },
  },
  {
    id: 'S-33 lost',
    desk: { layout: 'emergency' },
    path: '/emergency',
    session: 'account',
    two: true,
    ready: async (page) => {
      await expect(markLost(page)).toBeVisible();
    },
    open: async (page) => {
      await markLost(page).click();
      await page.getByLabel('Message for a finder').fill('Please call me');
      await page.getByRole('button', { name: 'Mark as lost', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'Lost mode is on.' })).toBeVisible();
    },
  },
  // P1b-4: pet profile panels
  {
    id: 'S-37',
    path: '/',
    session: 'demo',
    two: true,
    desk: { layout: 'overview' },
    ready: profile,
    open: async (page) => {
      await profileDetails(page);
      await expect(page.getByRole('button', { name: 'Edit details' }).first()).toBeVisible();
    },
  },
  {
    id: 'S-38',
    path: '/',
    session: 'demo',
    kind: 'overlay',
    ready: profile,
    open: async (page) => {
      await profileDetails(page);
      await page.getByRole('button', { name: 'Edit details' }).first().click();
      await expect(dialogNamed(/^Edit /)(page)).toBeVisible();
    },
  },
  {
    id: 'S-39',
    path: '/',
    session: 'demo',
    kind: 'overlay',
    ready: profile,
    open: async (page) => {
      await profileDetails(page);
      await page.getByRole('button', { name: 'Archive pet' }).click();
      await expect(dialogNamed(/^Archive .+[?]$/)(page)).toBeVisible();
    },
  },
  {
    id: 'S-40 health',
    path: '/',
    session: 'demo',
    two: true,
    desk: { layout: 'health' },
    ready: profile,
    open: async (page) => {
      await profileTab('Health')(page);
      await expect(page.getByRole('list', { name: 'Vaccinations' })).toBeVisible();
    },
  },
  {
    id: 'S-40 add',
    path: '/',
    session: 'demo',
    kind: 'overlay',
    ready: profile,
    open: profileOpener('Health', 'Add a vaccination', 'Add vaccination'),
  },
  {
    id: 'S-41 add',
    path: '/',
    session: 'demo',
    kind: 'overlay',
    ready: profile,
    open: profileOpener('Health', 'Add a medication', 'Add medication'),
  },
  {
    id: 'S-42 open',
    path: '/',
    session: 'demo',
    two: true,
    desk: { layout: 'health' },
    ready: profile,
    open: async (page) => {
      await profileTab('Health')(page);
      await openDisclosure(page, 'Vet visits');
      await expect(page.getByRole('button', { name: 'Add a visit' })).toBeVisible();
    },
  },
  {
    id: 'S-42 add',
    path: '/',
    session: 'demo',
    kind: 'overlay',
    ready: profile,
    open: profileOpener('Health', 'Add a visit', 'Add visit', 'Vet visits'),
  },
  {
    id: 'S-43 history',
    path: '/',
    session: 'demo',
    two: true,
    desk: { layout: 'health' },
    ready: profile,
    open: async (page) => {
      await profileTab('Health')(page);
      await page.locator('summary').filter({ hasText: 'All measurements' }).click();
      await expect(page.getByRole('table', { name: 'All measurements' })).toBeVisible();
    },
  },
  {
    id: 'S-43 add',
    path: '/',
    session: 'demo',
    kind: 'overlay',
    ready: profile,
    open: profileOpener('Health', 'Add a measurement', 'Add measurement'),
  },
  {
    id: 'S-44 condition',
    path: '/',
    session: 'demo',
    kind: 'overlay',
    ready: profile,
    open: profileOpener('Health', 'Add a condition', 'Add condition'),
  },
  {
    id: 'S-44 symptom',
    path: '/',
    session: 'demo',
    kind: 'overlay',
    ready: profile,
    open: profileOpener('Health', 'Add a symptom', 'Add symptom'),
  },
  {
    id: 'S-45',
    path: '/',
    session: 'demo',
    two: true,
    desk: { layout: 'files' },
    ready: profile,
    open: async (page) => {
      await profileTab('Files')(page);
      await expect(page.getByTestId('drop-zone')).toBeVisible();
    },
  },
  {
    id: 'S-46',
    path: '/',
    session: 'demo',
    kind: 'overlay',
    ready: profile,
    open: async (page) => {
      await profileTab('Files')(page);
      await page.getByLabel('Choose a file').setInputFiles({
        name: 'record.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4'),
      });
      await expect(dialogNamed('Add document')(page)).toBeVisible();
    },
  },
  {
    id: 'S-40 empty',
    path: '/',
    session: 'account',
    two: true,
    desk: { layout: 'health' },
    ready: mainReady,
    open: async (page) => {
      await newPetTab('Health')(page);
      await expect(page.locator('.empty').getByText(/^No vaccines yet./)).toBeVisible();
    },
  },
  {
    id: 'S-45 empty',
    path: '/',
    session: 'account',
    two: true,
    desk: { layout: 'single' },
    ready: mainReady,
    open: async (page) => {
      await newPetTab('Files')(page);
      await expect(page.locator('.empty').getByText(/^No files yet./)).toBeVisible();
    },
  },
  // P4: the Care tab (Today, Reminders, Feeding) and the reminder sheet
  {
    id: 'S-14 today',
    path: '/',
    session: 'demo',
    two: true,
    desk: { layout: 'care' },
    ready: profile,
    open: async (page) => {
      await profileTab('Care')(page);
      await expect(page.getByRole('heading', { level: 2, name: 'Today' })).toBeVisible();
    },
  },
  {
    id: 'S-15 list, feeding open',
    path: '/',
    session: 'demo',
    two: true,
    desk: { layout: 'care' },
    ready: profile,
    open: async (page) => {
      await profileTab('Care')(page);
      await addReminder(page, { title: 'Matrix walk', repeat: 'Daily', time: '18:00' });
      await expect(
        page.getByTestId('reminder-row').filter({ hasText: 'Matrix walk' }),
      ).toBeVisible();
      await openDisclosure(page, 'Feeding');
      // Some demo pets have a feeding routine and some do not.
      await expect(
        page.locator('details.disc[open], .card').filter({ hasText: 'Meals are never' }),
      ).toBeVisible();
    },
  },
  {
    id: 'S-15 new',
    path: '/',
    session: 'demo',
    kind: 'overlay',
    ready: profile,
    open: profileOpener('Care', 'Add a reminder for', 'New reminder'),
  },
  {
    id: 'S-15 new, weekly',
    path: '/',
    session: 'demo',
    kind: 'overlay',
    ready: profile,
    open: async (page) => {
      await profileOpener('Care', 'Add a reminder for', 'New reminder')(page);
      await dialogNamed('New reminder')(page)
        .getByRole('group', { name: 'Repeat' })
        .getByRole('button', { name: 'Weekly' })
        .click();
      await expect(page.getByRole('group', { name: 'Days of the week' })).toBeVisible();
    },
  },
  {
    id: 'S-15 edit',
    path: '/',
    session: 'demo',
    kind: 'overlay',
    ready: profile,
    open: async (page) => {
      await profileTab('Care')(page);
      await addReminder(page, { title: 'Matrix groom', repeat: 'Daily', time: '18:00' });
      await page.getByRole('button', { name: 'Edit reminder: Matrix groom' }).click();
      await expect(dialogNamed('Edit reminder')(page)).toBeVisible();
    },
  },
  {
    id: 'S-15 empty',
    path: '/',
    session: 'account',
    two: true,
    desk: { layout: 'care' },
    ready: mainReady,
    open: async (page) => {
      await newPetTab('Care')(page);
      await expect(page.locator('.empty').getByText(/^No reminders yet./)).toBeVisible();
    },
  },

  // Last: it makes the account's first pet, and the states above need an account without one.
  {
    id: 'S-06 sync pending',
    path: '/',
    session: 'account',
    widths: [900, 1280],
    ready: sidebarReady,
    open: async (page) => {
      await page.context().setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      // A change made while offline is what makes the count non-zero, so this one is always made.
      await addPet(page, 'Pending');
      await page.getByRole('link', { name: 'Home', exact: true }).first().click();
      await expect(page.getByTestId('pending-count')).not.toHaveAttribute('data-count', '0');
    },
    desk: { layout: 'home' },
  },
  {
    id: 'S-31',
    path: '/',
    session: 'account',
    kind: 'overlay',
    widths: [900, 1280],
    ready: sidebarReady,
    // Unsynced changes are what make Sign out ask first, so one is made while offline.
    open: async (page) => {
      await page.context().setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await addPet(page, 'Unsynced');
      await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(dialogNamed('You have changes that are not synced')(page)).toBeVisible();
    },
  },
  // Last in the demo: ticking a task changes the order of the pets for the states after it.
  {
    id: 'S-08',
    path: '/',
    session: 'demo',
    ready: async (page) => {
      await expect(page.getByTestId('pet-row').first()).toBeVisible();
    },
    open: async (page) => {
      await page.getByTestId('task-check').first().click();
      await expect(page.locator('.toast')).toBeVisible();
    },
    desk: { layout: 'home' },
  },
];
