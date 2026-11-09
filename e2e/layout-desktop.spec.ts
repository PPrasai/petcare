import { expect, test } from '@playwright/test';
import { addPet, signUp } from './support/app';

// QA-34: from 860 px the shell is a top bar with five destinations and a Log button, and Home is a
// list beside the profile; choosing a pet changes the URL.
test.use({ viewport: { width: 1280, height: 800 } });

test('the desktop layout has a top nav with a Log button, and a list beside the profile', async ({
  page,
}) => {
  await signUp(page, 'desktop');
  await addPet(page, 'Momo');
  await addPet(page, 'Biralo');

  const nav = page.getByRole('navigation', { name: 'Main' });
  for (const name of ['Home', 'Expenses', 'Emergency', 'Household', 'Settings']) {
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(nav.locator('.lnk')).toHaveCount(5);
  await expect(page.getByTestId('log-open')).toBeVisible();
  await expect(page.getByTestId('connectivity')).toBeVisible();

  // Home: the list on the left, the most urgent pet's profile on the right.
  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('pet-row')).toHaveCount(2);
  await expect(page.getByRole('tablist')).toBeVisible();
  const list = await page.getByRole('list', { name: 'Pets, most urgent first' }).boundingBox();
  const panel = await page.getByRole('tabpanel').boundingBox();
  expect(list && panel && list.x + list.width <= panel.x + 1).toBe(true);

  // Choosing a pet puts it in the URL and shows its profile beside the list.
  await page.getByTestId('pet-row').filter({ hasText: 'Momo' }).click();
  await expect(page).toHaveURL(/\/pets\/[0-9a-f-]+/);
  await expect(page.getByRole('heading', { level: 1, name: 'Momo' })).toBeVisible();
  await expect(page.getByTestId('pet-row')).toHaveCount(2);
  await page.getByTestId('pet-row').filter({ hasText: 'Biralo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Biralo' })).toBeVisible();

  // The phone-only More page sends a desktop to Settings.
  await page.goto('/more');
  await expect(page).toHaveURL(/\/settings$/);
});
