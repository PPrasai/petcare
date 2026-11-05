import { expect, test } from '@playwright/test';
import { addPet, signUp, waitSynced } from './support/app';

// QA-14: installable, and the shell plus cached data load offline.
test('manifest is installable and the app opens offline', async ({ page, context }) => {
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('PetCare');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);

  await signUp(page, 'pwa');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  await addPet(page, 'Momo');
  await waitSynced(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await page.getByRole('link', { name: 'Pets' }).click();
  await expect(page.getByText('Momo', { exact: true })).toBeVisible();
  await expect(page.getByTestId('connectivity')).toHaveText('Offline');
});
