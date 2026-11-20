import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Changing a profile tab is a change within the page, not a new page: it must not jump the
// page to the top. A new page does start at the top, and Back returns to where the page was.

const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

/** How far the tab panel starts below the sticky tab bar (negative: scrolled past its start). */
const paneOffset = (page: Page) =>
  page.evaluate(() => {
    const panel = document.querySelector('[role="tabpanel"]');
    const bar = panel?.previousElementSibling;
    if (!panel || !(bar instanceof HTMLElement)) throw new Error('no tab panel');
    return Math.round(panel.getBoundingClientRect().top - bar.offsetHeight);
  });

async function openDemo(page: Page) {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page).toHaveURL('/');
}

const petLinks = (page: Page) => page.locator('.plist a[href^="/pets/"]:not([href^="/pets/new"])');

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('switching a profile tab keeps the scroll position', async ({ page }) => {
    await openDemo(page);
    await petLinks(page).first().click();
    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.evaluate(() => window.scrollTo(0, 120));
    await page.getByRole('tab', { name: 'Health' }).click();
    await expect(page).toHaveURL(/tab=health/);
    expect(await scrollY(page)).toBe(120);

    await page.getByRole('tab', { name: 'Care' }).click();
    await expect(page).toHaveURL(/tab=care/);
    expect(await scrollY(page)).toBe(120);
  });

  test('a tab opened from deep in another starts under the tab bar', async ({ page }) => {
    await openDemo(page);
    await petLinks(page).first().click();
    await page.getByRole('tab', { name: 'Health' }).click();
    await expect(page).toHaveURL(/tab=health/);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await paneOffset(page)).toBeLessThan(-200);

    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(page).toHaveURL(/tab=overview/);
    const offset = await paneOffset(page);
    // At the start of the new tab, unless that tab is too short to scroll that far.
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(await scrollY(page)).toBeGreaterThan(0);
  });

  test('a new page starts at the top and Back returns to where the list was', async ({ page }) => {
    await openDemo(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const listY = await scrollY(page);
    expect(listY).toBeGreaterThan(0);

    await petLinks(page).last().click();
    await expect(page).toHaveURL(/\/pets\//);
    expect(await scrollY(page)).toBe(0);

    await page.goBack();
    await expect(page).toHaveURL('/');
    await expect.poll(() => scrollY(page)).toBe(listY);
  });
});
