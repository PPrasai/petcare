import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addPet, signUp } from './support/app';

// QA-33: on a phone there is no horizontal overflow, no visible scrollbar, five bottom-bar items,
// and the profile tabs change by swiping as well as by tapping.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x, y: from.y }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [{ x: to.x, y: to.y }],
  });
  await cdp.detach();
}

test('the phone layout has five bottom-bar items, no overflow and no scrollbars', async ({
  page,
}) => {
  await signUp(page, 'phone');
  await addPet(page, 'Momo');

  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.locator('.lnk')).toHaveCount(5);
  await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Expenses' })).toBeVisible();
  await expect(nav.getByTestId('log-open')).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Emergency' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'More' })).toBeVisible();

  for (const path of ['/', '/expenses', '/emergency', '/more']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await overflow(page), `${path} overflows horizontally`).toBeLessThanOrEqual(0);
  }

  // The tab strip scrolls sideways without showing a scrollbar.
  await page.goto('/');
  await page.getByTestId('pet-row').first().click();
  const bar = await page.getByRole('tablist').evaluate((el) => ({
    scrollbar: getComputedStyle(el).scrollbarWidth,
  }));
  expect(bar.scrollbar).toBe('none');
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test('swiping the profile changes the tab, and the tabs work from the keyboard', async ({
  page,
}) => {
  await signUp(page, 'swipe');
  await addPet(page, 'Momo');

  const tab = (name: string) => page.getByRole('tab', { name, exact: true });
  await expect(tab('Overview')).toHaveAttribute('aria-selected', 'true');

  const box = await page.getByRole('tabpanel').boundingBox();
  if (!box) throw new Error('the tab panel has no box');
  const y = box.y + 80;
  await swipe(page, { x: 330, y }, { x: 60, y });
  await expect(tab('Health')).toHaveAttribute('aria-selected', 'true');
  await swipe(page, { x: 330, y }, { x: 60, y });
  await expect(tab('Care')).toHaveAttribute('aria-selected', 'true');
  await swipe(page, { x: 60, y }, { x: 330, y });
  await expect(tab('Health')).toHaveAttribute('aria-selected', 'true');

  // A mostly vertical drag does not change the tab.
  await swipe(page, { x: 200, y }, { x: 140, y: y + 200 });
  await expect(tab('Health')).toHaveAttribute('aria-selected', 'true');

  // Keyboard: arrows move between tabs, Home and End jump.
  await tab('Health').focus();
  await page.keyboard.press('ArrowRight');
  await expect(tab('Care')).toHaveAttribute('aria-selected', 'true');
  await expect(tab('Care')).toBeFocused();
  await page.keyboard.press('End');
  await expect(tab('Files')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(tab('Overview')).toHaveAttribute('aria-selected', 'true');
});
