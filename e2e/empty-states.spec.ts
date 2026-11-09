import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { signUp } from './support/app';

// QA-32 (amended): the exact copy of every empty state in the SPEC-petcare-003 §5.1 inventory is
// visible in a `.empty` element, and no list renders an empty <ul>. P1b-1 starts with the pages:
// the 404 and the public page of a link that is gone. Later slices add their lists here.

const noEmptyLists = async (page: Page) => {
  const empty = await page
    .locator('ul, ol')
    .evaluateAll(
      (lists) => lists.filter((list) => list.querySelectorAll('li').length === 0).length,
    );
  expect(empty, 'a list with no items is rendered').toBe(0);
};

test('the public page of a link that is gone says so', async ({ page }) => {
  await page.goto(`/e/${'g'.repeat(43)}`);
  await expect(page.locator('.empty').getByText('This link is no longer active.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Pet emergency card' })).toBeVisible();
  await noEmptyLists(page);
});

test('an unknown address shows the 404 page, on its own and inside the shell', async ({ page }) => {
  await page.goto('/no-such-page');
  const empty = page.locator('.empty');
  await expect(empty.getByText('That page does not exist.')).toBeVisible();
  await expect(empty.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await noEmptyLists(page);

  // Signed in, the same page sits inside the shell and "Go to Home" leads back.
  await signUp(page, 'empty-404');
  await page.goto('/no-such-page');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.locator('main .empty').getByText('That page does not exist.')).toBeVisible();
  await page.getByRole('link', { name: 'Go to Home' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await noEmptyLists(page);
});
