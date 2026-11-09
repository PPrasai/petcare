import { expect, test } from '@playwright/test';
import { addPet, signUp } from './support/app';

// QA-16: offline indicator and pending count on every top-level route; sign-out warning.
const routes = ['Home', 'Expenses', 'Emergency', 'Household', 'Settings'];

test('offline edit shows the indicator and count on every route, and sign-out warns', async ({
  page,
  context,
}) => {
  await signUp(page, 'vis');
  await context.setOffline(true);
  await addPet(page, 'Biralo');

  for (const name of routes) {
    await page.getByRole('link', { name, exact: true }).click();
    await expect(page.getByTestId('connectivity')).toHaveText('Offline');
    await expect(page.getByTestId('pending-count')).toHaveAttribute('data-count', '1');
  }

  await page.getByRole('button', { name: 'Sign out' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Sync, then sign out' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Discard changes and sign out' })).toBeVisible();

  // Syncing while offline cannot finish, so the user stays signed in with the warning.
  await dialog.getByRole('button', { name: 'Sync, then sign out' }).click();
  await expect(dialog.getByText('Syncing did not finish')).toBeVisible();

  await context.setOffline(false);
  await dialog.getByRole('button', { name: 'Sync, then sign out' }).click();
  await expect(page).toHaveURL(/sign-in/);
});

test('discarding changes signs out', async ({ page, context }) => {
  await signUp(page, 'disc');
  await context.setOffline(true);
  await addPet(page, 'Ghost');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Discard changes and sign out' }).click();
  await expect(page).toHaveURL(/sign-in/);
});
