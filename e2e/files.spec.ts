import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addPet, signUp, waitSynced } from './support/app';

// A real 1x1 PNG, so the server's content sniffing accepts it.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const png = (name: string) => ({ name, mimeType: 'image/png', buffer: PNG });

type Change = { type: string; id: string; data: Record<string, unknown> };
const pulled = async (page: Page, type: string): Promise<Change[]> => {
  const pull = await (await page.request.get('/api/sync/pull')).json();
  return pull.changes.filter((c: Change) => c.type === type);
};

// CAP-12: documents, with files chosen offline uploaded on the next sync.
test('documents upload, open offline, and a file chosen offline syncs later', async ({
  page,
  context,
}) => {
  await signUp(page, 'docs');
  await addPet(page, 'Momo');
  await page.getByRole('tab', { name: 'Files' }).click();

  await page.getByLabel('Title').fill('Rabies certificate');
  await page.getByLabel('File (photo or PDF)').setInputFiles(png('rabies.png'));
  await page.getByRole('button', { name: 'Add document' }).click();
  const first = page.getByRole('listitem').filter({ hasText: 'Rabies certificate' });
  await expect(first).toBeVisible();
  await waitSynced(page);

  const [doc] = await pulled(page, 'document');
  const fileId = String(doc?.data.fileId);
  const download = await page.request.get(`/api/files/${fileId}`);
  expect(download.status()).toBe(200);
  expect(download.headers()['x-content-type-options']).toBe('nosniff');

  // Offline: add another document; it is kept on the device and can be opened.
  await context.setOffline(true);
  await page.getByLabel('Title').fill('Insurance card');
  await page.getByLabel('File (photo or PDF)').setInputFiles(png('card.png'));
  await page.getByRole('button', { name: 'Add document' }).click();
  const second = page.getByRole('listitem').filter({ hasText: 'Insurance card' });
  await expect(second).toContainText('waiting to upload');
  await second.getByRole('button', { name: 'View Insurance card' }).click();
  await expect(page.getByRole('dialog').getByRole('img', { name: 'Insurance card' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  // The first document's file was cached when it uploaded, so it opens offline too.
  await first.getByRole('button', { name: 'View Rabies certificate' }).click();
  await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await context.setOffline(false);
  await waitSynced(page);
  await expect(second).not.toContainText('waiting to upload');
  const docs = await pulled(page, 'document');
  expect(docs).toHaveLength(2);
  for (const d of docs) {
    expect((await page.request.get(`/api/files/${String(d.data.fileId)}`)).status()).toBe(200);
  }
});

test('an unsupported file is refused before upload', async ({ page }) => {
  await signUp(page, 'badfile');
  await addPet(page, 'Momo');
  await page.getByRole('tab', { name: 'Files' }).click();
  await page.getByLabel('File (photo or PDF)').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello'),
  });
  await expect(page.getByText('Choose a JPEG, PNG, WebP or HEIC image, or a PDF.')).toBeVisible();
});

// CAP-13: expenses, summary per period, pet and currency.
test('expenses are totalled per pet and per currency', async ({ page }) => {
  await signUp(page, 'money');
  await addPet(page, 'Momo');
  await page.getByRole('link', { name: 'Expenses' }).click();

  const add = async (amount: string, currency: string, category: string, receipt?: boolean) => {
    await page.getByLabel('Pet', { exact: true }).selectOption({ label: 'Momo' });
    await page.getByLabel('Category').selectOption({ label: category });
    await page.getByLabel('Amount').fill(amount);
    await page.getByLabel('Currency').fill(currency);
    if (receipt) await page.getByLabel('Receipt (optional)').setInputFiles(png('receipt.png'));
    await page.getByRole('button', { name: 'Add expense' }).click();
    await expect(page.getByLabel('Amount')).toHaveValue('');
  };
  await add('12.50', 'USD', 'Vet', true);
  await add('7.25', 'USD', 'Food');
  await add('1500', 'NPR', 'Grooming');

  const summary = page.getByRole('region', { name: 'Spending' });
  await expect(summary.getByText('Total in USD')).toBeVisible();
  await expect(summary.getByRole('row', { name: /Total in USD/ })).toContainText('$19.75');
  await expect(summary.getByRole('row', { name: /Total in NPR/ })).toContainText('1,500.00');
  await expect(summary.getByRole('row', { name: /Momo USD/ })).toContainText('$19.75');

  await page.getByRole('button', { name: 'View Receipt (optional)' }).click();
  await expect(page.getByRole('dialog').getByRole('img')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await waitSynced(page);
  const expenses = await pulled(page, 'expense');
  expect(expenses.map((e) => e.data.amountMinor).sort((a, b) => Number(a) - Number(b))).toEqual([
    725, 1250, 150_000,
  ]);
  expect(expenses.filter((e) => e.data.fileId)).toHaveLength(1);
});

// CAP-15: contacts, linked from a vet visit.
test('a contact can be added and linked to a vet visit', async ({ page }) => {
  await signUp(page, 'contacts');
  await addPet(page, 'Momo');
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('link', { name: 'Contacts' }).click();
  await page.getByLabel('Name').fill('Dr. Rai');
  await page.getByLabel('Phone').fill('+977 1 555 0100');
  await page.getByRole('button', { name: 'Add contact' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Dr. Rai' })).toBeVisible();

  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await page.getByRole('link', { name: 'Momo' }).click();
  await page.getByRole('tab', { name: 'Health' }).click();
  await page.getByLabel('Reason').fill('Annual check');
  await page.getByLabel('Vet or clinic').selectOption({ label: 'Dr. Rai' });
  await page.getByRole('button', { name: 'Add visit' }).click();
  await expect(page.getByText('With Dr. Rai')).toBeVisible();

  await waitSynced(page);
  const [visit] = await pulled(page, 'vetVisit');
  const [contact] = await pulled(page, 'contact');
  expect(visit?.data.contactId).toBe(contact?.id);
});
