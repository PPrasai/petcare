import { expect, test } from '@playwright/test';
import { addPet, signUp, waitSynced } from './support/app';

// QA-14: installable, and the shell plus cached data load offline.
test('manifest is installable and the app opens offline', async ({ page, context }) => {
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && url.origin !== 'http://localhost:4173')
      foreign.push(request.url());
  });
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.name).toBe('PetCare');
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/');
  expect(manifest.theme_color).toBe('#f2f1ef');
  expect(manifest.background_color).toBe('#f2f1ef');
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

  // QA-36: the fonts are served from this origin and are in the service worker's precache.
  const sw = await (await page.request.get('/sw.js')).text();
  expect((sw.match(/\.woff2/g) ?? []).length).toBeGreaterThanOrEqual(2);
  expect(foreign, 'requests to other origins').toEqual([]);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await expect(page.getByTestId('pet-row').filter({ hasText: 'Momo' })).toBeVisible();
  await expect(page.getByTestId('connectivity')).toHaveText('Offline');
});
