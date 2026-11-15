import { expect, test } from '@playwright/test';
import { addPet, signUp } from './support/app';

// QA-34: from 860 px the shell is a sidebar (a rail at 1024) with the Log button and six
// destinations, and Home is a dashboard with Your pets beside Today; a pet in the sidebar opens its
// profile, and there is no top nav.
test.use({ viewport: { width: 1024, height: 768 } });

test('the desktop layout has a sidebar rail with Log and six links, and Your pets beside Today', async ({
  page,
}) => {
  await signUp(page, 'desktop');
  await addPet(page, 'Momo');
  await addPet(page, 'Biralo');

  const side = page.getByRole('complementary', { name: 'Sidebar' });
  const nav = side.getByRole('navigation', { name: 'Main' });
  await expect(page.locator('.app')).toHaveAttribute('data-sidebar', 'collapsed');
  expect(Math.round((await side.boundingBox())?.width ?? 0)).toBe(68);
  for (const name of ['Home', 'Expenses', 'Emergency', 'Household', 'Contacts', 'Settings']) {
    await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await expect(nav.locator('.lnk')).toHaveCount(6);
  await expect(page.locator('.chrome')).toHaveCount(0);
  await expect(page.getByTestId('log-open')).toBeVisible();
  await expect(page.getByTestId('connectivity')).toBeVisible();

  // Home: Your pets on the left, Today beside it.
  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('pet-row')).toHaveCount(2);
  const pets = await page.locator('[data-area="pets"]').boundingBox();
  const today = await page.locator('[data-area="today"]').boundingBox();
  expect(pets && today && pets.x + pets.width <= today.x + 1).toBe(true);

  // A pet in the sidebar opens its profile, which is a page of its own.
  await page.getByTestId('side-pet').filter({ hasText: 'Momo' }).click();
  await expect(page).toHaveURL(/\/pets\/[0-9a-f-]+/);
  await expect(page.getByRole('heading', { level: 1, name: 'Momo' })).toBeVisible();
  await expect(page.getByRole('tablist')).toBeVisible();
  await page.getByTestId('side-pet').filter({ hasText: 'Biralo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Biralo' })).toBeVisible();

  // The phone-only More page sends a desktop to Settings.
  await page.goto('/more');
  await expect(page).toHaveURL(/\/settings$/);
});
