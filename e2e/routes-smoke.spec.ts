import { expect, test } from '@playwright/test';
import { signUp } from './support/app';

// Zustand selector loops show up as "Maximum update depth" console errors.
test('every route renders without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  for (const path of ['/sign-in', '/sign-up']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  await signUp(page, 'smoke');
  for (const path of ['/', '/pets', '/expenses', '/household', '/settings', '/sync']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('pending-count')).toBeVisible();
  }
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

  expect(errors.filter((e) => /Maximum update depth/.test(e))).toEqual([]);
  // The signed-out /api/me probe answers 401 by design; anything else is a real error.
  expect(errors.filter((e) => !/status of 401/.test(e))).toEqual([]);
});
