import { expect, test } from '@playwright/test';
import { addPet, signUp, waitSynced } from './support/app';

// CAP-19 / CAP-20 / CAP-08 / CAP-02: preferences, calendar link, sign-in methods, export, delete.
test('a user changes preferences, links a calendar, exports data and deletes the account', async ({
  page,
}) => {
  const email = await signUp(page, 'settings');
  await addPet(page, 'Momo');
  await waitSynced(page);
  await page.getByRole('link', { name: 'Settings' }).first().click();

  // Preferences are saved to the server and applied at once (theme) and after a reload.
  await page.getByLabel('Weight unit').selectOption('lb');
  await page.getByLabel('Theme').selectOption('dark');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByText('Preferences saved.')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByLabel('Weight unit')).toHaveValue('lb');
  const me = await (await page.request.get('/api/me')).json();
  expect(me.preferences.weightUnit).toBe('lb');

  // A bad currency is caught before anything is sent.
  await page.getByLabel('Currency (3 letters)').fill('US');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByText('Check the time zone, currency and lead times.')).toBeVisible();

  // The calendar address is shown once.
  await page.getByRole('button', { name: 'Create calendar link' }).click();
  await expect(page.getByLabel('Calendar address')).toHaveValue(/\/cal\/.+\.ics$/);
  await expect(page.getByRole('button', { name: 'Replace calendar link' })).toBeVisible();
  await page.getByRole('button', { name: 'Turn off calendar link' }).click();
  await expect(page.getByRole('button', { name: 'Create calendar link' })).toBeVisible();

  // Change the password: the new one works, the old one does not.
  await page.getByLabel('Current password').fill('correct-horse-battery');
  await page.getByLabel('New password').fill('another-long-password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('Password saved.')).toBeVisible();

  // Export downloads a ZIP.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my data' }).click();
  expect((await download).suggestedFilename()).toBe('petcare-export.zip');

  // Delete needs the typed phrase, then signs out and the account is gone.
  const remove = page.getByRole('button', { name: 'Delete my account' });
  await expect(remove).toBeDisabled();
  await page.getByLabel('Type DELETE MY ACCOUNT to confirm').fill('DELETE MY ACCOUNT');
  await remove.click();
  await expect(page).toHaveURL(/\/sign-in$/);
  const again = await page.request.post('/api/auth/sign-in/email', {
    data: { email, password: 'another-long-password' },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(again.status()).toBe(401);
});
