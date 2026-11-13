import { expect, test } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { signUp } from './app';
import { SCREENS } from './screens';
import type { Screen, Session } from './screens';

/** The widths and themes every screen state is checked at (SPEC-petcare-003 §6.2). */
export const WIDTHS = [
  { w: 390, h: 844, touch: true },
  { w: 1280, h: 800, touch: false },
] as const;
export const THEMES = ['light', 'dark'] as const;

export type Width = (typeof WIDTHS)[number];
export type Theme = (typeof THEMES)[number];
export interface Cell {
  width: Width;
  theme: Theme;
  /** For example `390/dark`. */
  label: string;
}

/**
 * Declares one test per width and theme. A failure names its cell. The theme comes from
 * `prefers-color-scheme`, with the user's Theme preference left at System.
 */
export function forEachCell(title: string, fn: (cell: Cell, browser: Browser) => Promise<void>) {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      const cell: Cell = { width, theme, label: `${width.w}/${theme}` };
      test(`${title} @${cell.label}`, async ({ browser }) => {
        test.setTimeout(900_000);
        await fn(cell, browser);
      });
    }
  }
}

async function open(
  browser: Browser,
  cell: Cell,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: { width: cell.width.w, height: cell.width.h },
    hasTouch: cell.width.touch,
    colorScheme: cell.theme,
    reducedMotion: 'reduce',
    baseURL: 'http://localhost:4173',
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('petcare-theme', 'system');
    } catch {
      // No storage: the default is System anyway.
    }
  });
  // A click that cannot land fails after 15 s and names its screen, not after the whole test.
  context.setDefaultTimeout(15_000);
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: cell.theme, reducedMotion: 'reduce' });
  return { context, page };
}

async function startSession(page: Page, session: Session) {
  if (session === 'demo') {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Try the demo' }).click();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  } else if (session === 'account') {
    await signUp(page, 'matrix');
  }
}

/** Puts the page into the state a screen entry describes. */
async function enter(page: Page, screen: Screen, browser: Browser) {
  const path = typeof screen.path === 'function' ? await screen.path(browser) : screen.path;
  // A full load keeps the session (the demo and the account both survive a reload). A change of
  // the hash alone would not load the page again, so leave it first.
  if (new URL(page.url(), 'http://x').pathname === path.split('#')[0])
    await page.goto('about:blank');
  await page.goto(path);
  await screen.ready(page);
  await screen.open?.(page, browser);
}

/**
 * Walks every screen state that applies to the cell, one session at a time (a session is made
 * once per cell, not once per state), and calls `check` in each. Failures are collected, so one run
 * reports every `S-xx@390/dark` that is wrong.
 */
export async function walkScreens(
  cell: Cell,
  browser: Browser,
  check: (page: Page, screen: Screen) => Promise<string[]>,
) {
  const problems: string[] = [];
  for (const session of ['none', 'demo', 'account'] as const) {
    const screens = SCREENS.filter(
      (s) => s.session === session && (s.widths ?? [390, 1280]).includes(cell.width.w),
    );
    if (screens.length === 0) continue;
    const { context, page } = await open(browser, cell);
    try {
      await startSession(page, session);
      for (const screen of screens) {
        try {
          await enter(page, screen, browser);
          for (const message of await check(page, screen)) {
            problems.push(`${screen.id}@${cell.label}: ${message}`);
          }
        } catch (error) {
          problems.push(`${screen.id}@${cell.label}: could not reach the state: ${String(error)}`);
        }
      }
    } finally {
      await context.close();
    }
  }
  expect(problems, `${cell.label} has failing screens`).toEqual([]);
}
