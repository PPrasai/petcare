import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { shareEmergencyCard } from './app';

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
  open?: (page: Page) => Promise<void>;
  /** The widths it exists at (More is a phone page). Both when left out. */
  widths?: (390 | 1280)[];
  /** `overlay` is a sheet or dialog: QA-40 checks overflow, fonts and hit areas only. */
  kind?: 'page' | 'overlay';
  /** A two-column screen: its `.two` has two tracks at 1280 and one at 390. */
  two?: boolean;
}

const heading =
  (name: string | RegExp, level = 1) =>
  async (page: Page) => {
    await expect(page.getByRole('heading', { level, name })).toBeVisible();
  };

/** A pet's profile: a row opens it on a phone; from 860 px it already sits beside the list. */
const profile = async (page: Page) => {
  const tabs = page.getByRole('tablist');
  if (!(await tabs.isVisible())) await page.getByTestId('pet-row').first().click();
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
  await expect(logSheet(page).getByRole('heading', { level: 2 })).not.toHaveText('Log something');
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
  },
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
    ['weight', 0],
    ['note', 1],
    ['expense', 2],
    ['vet visit', 3],
    ['photo', 4],
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
  { id: 'S-11 overview', path: '/', session: 'demo', ready: profile },
  {
    id: 'S-17',
    path: '/more',
    session: 'demo',
    widths: [390],
    ready: heading('More'),
  },
];
