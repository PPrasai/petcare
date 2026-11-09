import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const SKIP_STORES = new Set(['outbox', 'meta', 'problems', 'conflicts', 'pendingFiles']);

/** Every record in the demo database, without timestamps (they change each time it is seeded). */
async function snapshot(page: Page): Promise<unknown[]> {
  return page.evaluate(
    (skip) =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open('petcare-u-demo-user');
        open.onerror = () => reject(open.error);
        open.onsuccess = async () => {
          const db = open.result;
          const rows: unknown[] = [];
          for (const name of Array.from(db.objectStoreNames)) {
            if (skip.includes(name)) continue;
            const all = await new Promise<
              {
                id: string;
                type: string;
                version: number;
                deletedAt: string | null;
                data: unknown;
              }[]
            >((done) => {
              const request = db.transaction(name).objectStore(name).getAll();
              request.onsuccess = () => done(request.result);
            });
            for (const r of all) {
              rows.push({
                id: r.id,
                type: r.type,
                version: r.version,
                deletedAt: r.deletedAt,
                data: r.data,
              });
            }
          }
          db.close();
          resolve(
            rows.sort((a, b) =>
              String((a as { id: string }).id).localeCompare(String((b as { id: string }).id)),
            ),
          );
        };
      }),
    [...SKIP_STORES],
  );
}

// CAP-03 / QA-03: the demo is complete, marked, resettable, and never touches the server.
test('the demo works end to end with no request to /api, and reset restores the sample data', async ({
  page,
}) => {
  await page.goto('/sign-in');
  const tryDemo = page.getByRole('button', { name: 'Try the demo' });
  await expect(tryDemo).toBeVisible();

  const apiCalls: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(request.url());
  });

  await tryDemo.click();
  const banner = page.getByRole('region', { name: 'Demo mode' });
  await expect(banner).toContainText('Demo — changes stay on this device');

  // Home ranks the sample pets by what needs doing.
  await expect(
    page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening)/ }),
  ).toBeVisible();
  const row = (name: string) => page.getByTestId('pet-row').filter({ hasText: name });
  await expect(row('Momo')).toBeVisible();
  await expect(row('Biralo')).toBeVisible();

  // The profile, with every section of a pet.
  await row('Momo').click();
  for (const [tab, text] of [
    ['Health', 'Rabies'],
    ['Health', 'Carprofen'],
    ['Health', 'Annual check-up'],
    ['Health', 'Chicken'],
    ['Care', 'Morning walk'],
    ['Files', 'Rabies certificate'],
  ] as const) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(page.getByText(text).first()).toBeVisible();
  }

  // A sample file opens from the device, and the server-only link is explained, not offered.
  await page.getByRole('button', { name: 'View Rabies certificate' }).click();
  await expect(page.getByRole('dialog').locator('img')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Emergency card' }).click();
  await expect(page.getByText(/public emergency link needs an account/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create link' })).toHaveCount(0);

  // Expenses, contacts, household, settings and sync activity.
  await page.getByRole('link', { name: 'Expenses', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Expenses' })).toBeVisible();
  await page.getByRole('link', { name: 'Household', exact: true }).click();
  await expect(page.getByText(/Inviting people .* turned off in the demo/)).toBeVisible();
  await expect(page.getByText('Sam · Caretaker')).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByText(/Phone notifications need an account/)).toBeVisible();
  await page.getByRole('link', { name: 'Contacts' }).click();
  await expect(page.getByText('Dr. Rai')).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Sync activity' }).click();
  await expect(page.getByRole('button', { name: 'Sync now' })).toBeVisible();
  await page.getByRole('button', { name: 'Sync now' }).click();

  // Changes stay on the device, survive a reload, and are gone after a reset.
  const fresh = await snapshot(page);
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await page.getByRole('link', { name: 'Add a pet' }).click();
  await page.getByLabel('Pet name').fill('Pixel');
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Pixel' })).toBeVisible();
  expect(await snapshot(page)).not.toEqual(fresh);

  await page.reload();
  await expect(banner).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await expect(row('Pixel')).toBeVisible();

  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(row('Pixel')).toHaveCount(0);
  await expect(row('Momo')).toBeVisible();
  expect(await snapshot(page)).toEqual(fresh);

  // The whole session, reload included, sent nothing to the server.
  expect(apiCalls).toEqual([]);

  // Leaving returns to sign-in. Only then does the page ask for the sign-in options again, because
  // the demo was reopened by a reload and so never loaded them.
  await page.getByRole('button', { name: 'Exit demo' }).click();
  await expect(page.getByRole('button', { name: 'Try the demo' })).toBeVisible();
  await expect(banner).toHaveCount(0);

  expect(apiCalls.every((url) => new URL(url).pathname === '/api/config')).toBe(true);
});
