import { expect, test } from '@playwright/test';
import { signUp, waitSynced } from './support/app';

// Audit A: preferences are saved on the device first, then sent when the connection is back; a new
// account starts on the device's time zone, not UTC.
test.use({ timezoneId: 'Asia/Tokyo' });

test('a new account takes the device time zone, and preferences saved offline sync later', async ({
  page,
  context,
}) => {
  await signUp(page, 'prefs-offline');
  await waitSynced(page);
  await expect
    .poll(async () => (await (await page.request.get('/api/me')).json()).preferences.timeZone)
    .toBe('Asia/Tokyo');

  await page.getByRole('link', { name: 'Settings' }).first().click();
  await expect(page.getByLabel('Time zone')).toHaveValue('Asia/Tokyo');

  await context.setOffline(true);
  await page.getByLabel('Weight unit').selectOption('lb');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByText('Preferences saved.')).toBeVisible();
  await expect(page.getByText('Saved on this device. Will sync when online.')).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('Saved on this device. Will sync when online.')).toHaveCount(0, {
    timeout: 90_000,
  });
  const me = await (await page.request.get('/api/me')).json();
  expect(me.preferences.weightUnit).toBe('lb');
});
