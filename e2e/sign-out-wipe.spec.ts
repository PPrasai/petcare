import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addPet, signUp, userId, waitSynced } from './support/app';

// QA-22: sign-out removes the user's local data; the next user on the browser sees none of it.
const databases = (page: Page) =>
  page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));

test('sign-out wipes the local database and file cache', async ({ page }) => {
  await signUp(page, 'wipea');
  const a = await userId(page);
  await addPet(page, 'SecretPet');
  await waitSynced(page);
  await page.evaluate(async (id) => {
    const cache = await caches.open(`petcare-files-${id}`);
    await cache.put('/api/files/x', new Response('private'));
  }, a);
  expect(await databases(page)).toContain(`petcare-u-${a}`);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/sign-in/);
  expect(await databases(page)).not.toContain(`petcare-u-${a}`);
  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames.filter((n) => n.startsWith('petcare-files-'))).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('petcare-last-session'))).toBeNull();

  await signUp(page, 'wipeb');
  await page.getByRole('link', { name: 'Pets' }).click();
  await expect(page.getByText('No pets yet')).toBeVisible();
  await expect(page.getByText('SecretPet')).toHaveCount(0);
  expect(await databases(page)).not.toContain(`petcare-u-${a}`);
});
