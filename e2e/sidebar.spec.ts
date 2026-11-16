import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { expectedTracks } from './support/desktop-layouts';
import { addPet, signUp } from './support/app';

// QA-43: the sidebar's contents, width default, collapse, remembered choice, blocked storage,
// keyboard, accessible names and axe; and no sidebar at 820 px (SPEC-petcare-004 5.4).
const side = (page: Page) => page.getByRole('complementary', { name: 'Sidebar' });
const app = (page: Page) => page.locator('.app');
const toggle = (page: Page) => side(page).getByRole('button', { name: /sidebar$/ });
const width = async (page: Page) => Math.round((await side(page).boundingBox())?.width ?? 0);
const NAV = ['Home', 'Expenses', 'Emergency', 'Household', 'Contacts', 'Settings'];

async function account(page: Page, w: number, h = 720) {
  await page.setViewportSize({ width: w, height: h });
  await signUp(page, 'sidebar');
  await addPet(page, 'Momo');
  await addPet(page, 'Biralo');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('pet-row')).toHaveCount(2);
}

const homeTracks = (page: Page) =>
  page.evaluate(() => {
    const grid = document.querySelector('main .two[data-layout="home"]');
    const main = document.querySelector('main');
    if (!grid || !main) return { tracks: 0, content: 0 };
    const box = getComputedStyle(main);
    return {
      tracks: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
      content: main.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight),
    };
  });

test('contents, names and order at 1280', async ({ page }) => {
  await account(page, 1280);
  await expect(app(page)).toHaveAttribute('data-sidebar', 'expanded');
  expect(await width(page)).toBe(236);

  const nav = side(page).getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link')).toHaveText(NAV);
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('log-open')).toHaveCount(1);
  await expect(side(page).getByRole('button', { name: 'Log something' })).toBeVisible();
  await expect(side(page).getByRole('link', { name: 'Add a pet' })).toBeVisible();
  // Pets in Home order, linked to their profiles, not counted as Home rows.
  await expect(page.getByTestId('side-pet')).toHaveCount(2);
  await expect(side(page).getByRole('list', { name: 'Pets' }).getByRole('link')).toHaveCount(2);
  await expect(page.getByTestId('connectivity')).toBeVisible();
  await expect(side(page).getByText('sidebar Person')).toBeVisible();

  // A pet in the sidebar opens its profile, and is the current page there.
  await page.getByTestId('side-pet').filter({ hasText: 'Momo' }).click();
  await expect(page).toHaveURL(/\/pets\/[0-9a-f-]+/);
  await expect(page.getByRole('heading', { level: 1, name: 'Momo' })).toBeVisible();
  await expect(page.getByTestId('side-pet').filter({ hasText: 'Momo' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  // Log starts with the open pet.
  await page.getByTestId('log-open').click();
  await expect(page.getByRole('dialog', { name: 'Log something' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('width default: expanded at 1280, collapsed at 900, and a resize follows it', async ({
  page,
}) => {
  await account(page, 1280);
  await expect(app(page)).toHaveAttribute('data-sidebar', 'expanded');
  await page.setViewportSize({ width: 900, height: 720 });
  await expect(app(page)).toHaveAttribute('data-sidebar', 'collapsed');
  await expect.poll(() => width(page)).toBe(68);
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(app(page)).toHaveAttribute('data-sidebar', 'expanded');
});

test('the rail keeps every name, and the toggle remembers the choice', async ({ page }) => {
  await account(page, 900);
  await expect(app(page)).toHaveAttribute('data-sidebar', 'collapsed');
  expect(await width(page)).toBe(68);
  const nav = side(page).getByRole('navigation', { name: 'Main' });
  for (const name of NAV) await expect(nav.getByRole('link', { name })).toBeVisible();
  await expect(side(page).getByRole('button', { name: 'Log something' })).toBeVisible();
  await expect(side(page).getByRole('link', { name: 'Add a pet' })).toBeVisible();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle(page)).toHaveAttribute('aria-controls', 'sidebar');
  await expect(toggle(page)).toHaveAccessibleName('Expand sidebar');

  // Pressing it expands the rail and stores the choice, which survives a reload and a resize.
  await toggle(page).click();
  await expect(app(page)).toHaveAttribute('data-sidebar', 'expanded');
  await expect.poll(() => width(page)).toBe(236);
  await expect(toggle(page)).toHaveAccessibleName('Collapse sidebar');
  expect(await page.evaluate(() => localStorage.getItem('pc:sidebar'))).toBe('expanded');
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-sidebar', 'expanded');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.setViewportSize({ width: 900, height: 720 });
  await expect(app(page)).toHaveAttribute('data-sidebar', 'expanded');

  // The Home grid follows the width it now has.
  await expect(page.locator('main .two[data-layout="home"]')).toBeVisible();
  await expect
    .poll(async () => {
      const { tracks, content } = await homeTracks(page);
      return tracks === expectedTracks('home', content);
    })
    .toBe(true);
  await toggle(page).click();
  await expect(app(page)).toHaveAttribute('data-sidebar', 'collapsed');
  await expect
    .poll(async () => {
      const { tracks, content } = await homeTracks(page);
      return tracks === expectedTracks('home', content);
    })
    .toBe(true);
});

test('the toggle works from the keyboard and keeps focus', async ({ page }) => {
  await account(page, 1280);
  await toggle(page).focus();
  await page.keyboard.press('Enter');
  await expect(app(page)).toHaveAttribute('data-sidebar', 'collapsed');
  await expect(toggle(page)).toBeFocused();
  await page.keyboard.press('Space');
  await expect(app(page)).toHaveAttribute('data-sidebar', 'expanded');
  await expect(toggle(page)).toBeFocused();

  // Tab order: skip link, toggle, Log, the six links, Add a pet, the pets, the sync pill, then main.
  await page.reload();
  await expect(side(page)).toBeVisible();
  const order: string[] = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    order.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        return (
          el?.getAttribute('aria-label') ??
          el?.textContent?.trim().split('\n')[0] ??
          ''
        ).slice(0, 40);
      }),
    );
  }
  expect(order[0]).toContain('Skip');
  expect(order[1]).toBe('Collapse sidebar');
  expect(order[2]).toBe('Log something');
  expect(order.slice(3, 9).map((n) => n.replace(/\d+ overdue$/, '').trim())).toEqual(NAV);
});

test('with storage blocked the default applies and nothing throws', async ({ browser }) => {
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 900, height: 720 },
    baseURL: 'http://localhost:4173',
  });
  await context.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('storage is blocked');
      },
    });
  });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await signUp(page, 'blocked');
    await expect(app(page)).toHaveAttribute('data-sidebar', 'collapsed');
    await toggle(page).click();
    await expect(app(page)).toHaveAttribute('data-sidebar', 'expanded');
    expect(errors.filter((e) => e.includes('storage is blocked'))).toEqual([]);
  } finally {
    await context.close();
  }
});

test('axe finds nothing serious in the sidebar, open or collapsed', async ({ page }) => {
  await account(page, 1280);
  for (const state of ['expanded', 'collapsed']) {
    await expect(app(page)).toHaveAttribute('data-sidebar', state);
    const results = await new AxeBuilder({ page })
      .include('.side')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(
      results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical'),
      state,
    ).toEqual([]);
    await toggle(page).click();
  }
});

test('there is no sidebar at 820 px', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await signUp(page, 'phone');
  await expect(page.locator('.side')).toHaveCount(0);
  await expect(page.locator('.nav')).toBeVisible();
});
