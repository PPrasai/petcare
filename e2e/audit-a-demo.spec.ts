import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Audit fixes (PR A) that need no server: they run on the demo build with /api unreachable.
async function openDemo(page: Page) {
  await page.route('**/api/**', (route) => route.abort('connectionrefused'));
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByRole('region', { name: 'Demo mode' })).toBeVisible();
}

const toast = (page: Page) => page.locator('.toast');

test('a delete is one tap with an Undo toast that brings the record back', async ({ page }) => {
  await openDemo(page);
  await page.goto('/contacts');
  await expect(page.getByText('Dr. Rai')).toBeVisible();
  await page.getByRole('button', { name: /^Delete Dr\. Rai/ }).click();
  await expect(toast(page)).toContainText('Deleted Dr. Rai');
  await expect(page.getByText('Dr. Rai', { exact: true })).toHaveCount(0);
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Dr. Rai', { exact: true })).toBeVisible();
  // Still there after a reload: the undo is a real write, not just a redraw.
  await page.reload();
  await expect(page.getByText('Dr. Rai', { exact: true })).toBeVisible();
});

test('every Log sheet kind offers Undo, and Undo removes what was logged', async ({ page }) => {
  await openDemo(page);
  const open = async (kind: string) => {
    await page.getByTestId('log-open').filter({ visible: true }).click();
    await page
      .getByRole('dialog', { name: 'Log something' })
      .getByRole('button', { name: kind, exact: true })
      .click();
  };
  const sheet = page.getByRole('dialog', { name: 'Log something' });

  await open('Weight');
  await sheet.getByRole('button', { name: /^Save weight/ }).click();
  await expect(toast(page).getByRole('button', { name: 'Undo' })).toBeVisible();

  await open('Note');
  await sheet.getByLabel('Note', { exact: true }).fill('Limping a little');
  await sheet.getByRole('button', { name: /^Save note/ }).click();
  await expect(toast(page).getByRole('button', { name: 'Undo' })).toBeVisible();

  await open('Expense');
  await sheet.getByLabel('Amount').fill('7');
  await sheet.getByRole('button', { name: /^Save expense/ }).click();
  await expect(toast(page).getByRole('button', { name: 'Undo' })).toBeVisible();

  await open('Vet visit');
  await sheet.getByLabel('Reason').fill('Recheck');
  await sheet.getByRole('button', { name: /^Save visit/ }).click();
  await expect(toast(page).getByRole('button', { name: 'Undo' })).toBeVisible();
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(toast(page)).toHaveCount(0);
});

test('/sync in the demo says the data stays on the device and has no Sync now', async ({
  page,
}) => {
  await openDemo(page);
  await page.goto('/sync');
  await expect(page.getByText('Demo data is kept on this device')).toBeVisible();
  await expect(page.getByText('All changes saved')).toHaveCount(0);
  await expect(page.getByText('Not synced yet')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sync now' })).toHaveCount(0);
});

test('the add-pet wizard makes exactly one pet', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('link', { name: 'Add a pet' }).first().click();
  await page.getByLabel('Name', { exact: true }).fill('Twin');
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Twin' })).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await expect(page.getByTestId('pet-row').filter({ hasText: 'Twin' })).toHaveCount(1);
});

test('a browser that cannot store files still saves the expense, and says so', async ({ page }) => {
  // WebKit private sessions refuse a Blob in IndexedDB; the sample files are skipped the same way.
  await page.addInitScript(() => {
    const refuse = (original: (...args: unknown[]) => unknown) =>
      function (this: unknown, ...args: unknown[]) {
        if (args[0] instanceof Object && (args[0] as { blob?: unknown }).blob instanceof Blob) {
          throw new DOMException(
            'Error preparing Blob/File data to be stored in object store',
            'UnknownError',
          );
        }
        return original.apply(this, args);
      };
    IDBObjectStore.prototype.put = refuse(IDBObjectStore.prototype.put as never) as never;
    IDBObjectStore.prototype.add = refuse(IDBObjectStore.prototype.add as never) as never;
  });
  await openDemo(page);
  await page.getByRole('link', { name: 'Expenses', exact: true }).first().click();
  await page.getByRole('button', { name: 'Add an expense' }).click();
  await page.getByLabel('Amount').fill('9.99');
  await page.getByLabel(/Receipt|File/).setInputFiles({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgo=', 'base64'),
  });
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(toast(page)).toContainText("files can't be saved in this browser mode");
  await expect(page.getByText('9.99').first()).toBeVisible();
});

// With the service worker active (as on CI) it answers the chunk from its precache and page.route never
// sees the request, so the aborted chunk must be tested with workers blocked.
test.describe('lazy chunk failure', () => {
  test.use({ serviceWorkers: 'block' });
  test('a screen that fails to load shows the friendly screen with Reload and Home', async ({
    page,
  }) => {
    await openDemo(page);
    await page.route('**/assets/ContactsPage*.js', (route) => route.abort());
    await page.goto('/contacts');
    await expect(page.getByTestId('crash-screen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to Home' })).toBeVisible();
  });
});

test('start-up with a server that answers 500 shows sign-in with a message, not a white page', async ({
  page,
}) => {
  await page.route('**/api/config', (route) => route.fulfill({ status: 500, body: 'oops' }));
  await page.route('**/api/me', (route) => route.fulfill({ status: 500, body: '<html>oops' }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText(/couldn't get a usable answer/)).toBeVisible();
});
