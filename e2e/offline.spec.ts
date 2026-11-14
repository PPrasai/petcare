import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  addPet,
  addReminder,
  openDetails,
  openDisclosure,
  signUp,
  waitSynced,
} from './support/app';

// A real 1x1 PNG, so the server's content sniffing accepts it.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

interface Change {
  type: string;
  id: string;
  deletedAt: string | null;
  data: Record<string, unknown>;
}
const pullAll = async (page: Page): Promise<Change[]> =>
  (await (await page.request.get('/api/sync/pull')).json()).changes as Change[];

const openPet = async (page: Page) => {
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await page.getByTestId('pet-row').filter({ hasText: 'Momo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Momo' })).toBeVisible();
};
const tab = async (page: Page, name: string) => {
  await openPet(page);
  await page.getByRole('tab', { name, exact: true }).click();
};

// QA-02: every record type can be created, edited and deleted offline (CAP-04 to CAP-15), survives
// an offline reload, and reaches the server when the connection returns.
test('every record type works offline, survives a reload, and syncs when back online', async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  await signUp(page, 'offline-all');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await addPet(page, 'Momo');
  // Records that exist on the server before going offline, so deleting them offline must sync
  // (deleting a record whose create was never sent is eliminated from the outbox by design).
  await page.getByRole('tab', { name: 'Health' }).click();
  await page.getByRole('button', { name: 'Add a measurement' }).click();
  await page.getByLabel(/^Value/).fill('12.5');
  await page.getByRole('button', { name: 'Add measurement' }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
  await page.getByRole('link', { name: 'Contacts' }).click();
  await page.getByRole('button', { name: 'Add a contact' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Temp clinic');
  await page.getByRole('button', { name: 'Add contact' }).click();
  await expect(page.getByTestId('contact-row').filter({ hasText: 'Temp clinic' })).toBeVisible();
  await waitSynced(page);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  await context.setOffline(true);

  // CAP-04: edit the pet.
  await openPet(page);
  await openDetails(page);
  await page.getByRole('button', { name: 'Edit details' }).click();
  await page.getByLabel('Colour').fill('Brindle');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Brindle')).toBeVisible();

  // Measurements (create, then delete one).
  await tab(page, 'Health');
  await openDisclosure(page, 'All measurements');
  await page.getByRole('button', { name: /^Delete Weight from/ }).click();
  await page.getByRole('button', { name: 'Add a measurement' }).click();
  await page.getByLabel(/^Value/).fill('13');
  await page.getByRole('button', { name: 'Add measurement' }).click();

  // Vaccination, medication, vet visit.
  await page.getByRole('tab', { name: 'Health' }).click();
  await page.getByRole('button', { name: 'Add a vaccination' }).click();
  await page.getByLabel('Vaccine', { exact: true }).fill('Rabies');
  await page.getByLabel('Given on').fill('2025-01-15');
  await page.getByRole('button', { name: 'Add vaccination' }).click();
  await expect(page.getByText('Given 2025-01-15')).toBeVisible();

  await page.getByRole('tab', { name: 'Health' }).click();
  await page.getByRole('button', { name: 'Add a medication' }).click();
  await page.getByLabel('Medication', { exact: true }).fill('Amoxicillin');
  await page.getByLabel('Dose', { exact: true }).fill('5');
  await page.getByLabel('Dose unit').selectOption('mg');
  await page.getByLabel('Times (24-hour, comma separated)').fill('09:00');
  await page.getByRole('button', { name: 'Add medication' }).click();
  await expect(page.getByText('Amoxicillin').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Health' }).click();
  await openDisclosure(page, 'Vet visits');
  await page.getByRole('button', { name: 'Add a visit' }).click();
  await page.getByLabel('Reason', { exact: true }).fill('Annual check');
  await page.getByRole('button', { name: 'Add visit' }).click();
  await expect(
    page.getByRole('list', { name: 'Vet visits' }).getByText('Annual check'),
  ).toBeVisible();

  // Condition, symptom.
  await page.getByRole('tab', { name: 'Health' }).click();
  await page.getByRole('button', { name: 'Add a condition' }).click();
  await page.getByLabel('Condition name').fill('Asthma');
  await page.getByRole('button', { name: 'Add condition' }).click();
  await expect(page.getByText('Asthma').first()).toBeVisible();
  await page.getByRole('button', { name: 'Add a symptom' }).click();
  await page.getByLabel('What you noticed').fill('Coughing at night');
  await page.getByRole('button', { name: 'Add symptom' }).click();
  await expect(
    page.getByRole('list', { name: 'Symptoms journal' }).getByText('Coughing at night'),
  ).toBeVisible();

  // Reminder, document with a file (kept on the device until it can upload).
  await page.getByRole('tab', { name: 'Care' }).click();
  await addReminder(page, { title: 'Breakfast', repeat: 'Daily', time: '08:00' });
  await expect(page.getByTestId('reminder-row').filter({ hasText: 'Breakfast' })).toBeVisible();

  await page.getByRole('tab', { name: 'Files' }).click();
  await page
    .getByLabel('Choose a file')
    .setInputFiles({ name: 'card.png', mimeType: 'image/png', buffer: PNG });
  await page.getByLabel('Title').fill('Insurance card');
  await page.getByLabel('Category').selectOption('insurance');
  await page.getByRole('button', { name: 'Add document' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Insurance card' })).toContainText(
    'waiting to upload',
  );

  // Another reminder, then the expense and the contact.
  await page.getByRole('tab', { name: 'Care' }).click();
  await addReminder(page, { title: 'Order food', repeat: 'Weekly', days: ['Mon'], time: '10:00' });
  await expect(page.getByTestId('reminder-row').filter({ hasText: 'Order food' })).toBeVisible();

  await page.getByRole('link', { name: 'Expenses', exact: true }).click();
  await page.getByRole('button', { name: 'Add an expense' }).click();
  await page.getByLabel('Amount').fill('42.50');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByRole('list', { name: 'Expenses' }).getByRole('listitem')).toHaveCount(1);

  await page.getByRole('link', { name: 'Settings', exact: true }).first().click();
  await page.getByRole('link', { name: 'Contacts' }).click();
  await page.getByRole('button', { name: 'Add a contact' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Dr Rao');
  await page.getByRole('button', { name: 'Add contact' }).click();
  await expect(page.getByTestId('contact-row').filter({ hasText: 'Dr Rao' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Temp clinic' }).click();
  await expect(page.getByTestId('contact-row').filter({ hasText: 'Temp clinic' })).toHaveCount(0);

  // Reload while still offline: everything is still there.
  await page.reload();
  await expect(page.getByTestId('contact-row').filter({ hasText: 'Dr Rao' })).toBeVisible();
  await tab(page, 'Health');
  await expect(page.getByText('Given 2025-01-15')).toBeVisible();
  await expect(page.getByText('Asthma').first()).toBeVisible();
  await tab(page, 'Files');
  await expect(page.getByRole('listitem').filter({ hasText: 'Insurance card' })).toBeVisible();
  await openPet(page);
  await openDetails(page);
  await expect(page.getByText('Brindle')).toBeVisible();

  // Back online: the server has every change.
  await context.setOffline(false);
  await waitSynced(page);
  const changes = await pullAll(page);
  const live = (type: string) => changes.filter((c) => c.type === type && c.deletedAt === null);
  expect(live('pet')[0]?.data.colour).toBe('Brindle');
  expect(live('measurement')).toHaveLength(1);
  expect(changes.filter((c) => c.type === 'measurement' && c.deletedAt !== null)).toHaveLength(1);
  expect(live('vaccination').map((c) => c.data.vaccineName)).toContain('Rabies');
  expect(live('medication').map((c) => c.data.name)).toContain('Amoxicillin');
  expect(live('vetVisit').map((c) => c.data.reason)).toContain('Annual check');
  expect(live('condition').map((c) => c.data.name)).toContain('Asthma');
  expect(live('symptomEntry').map((c) => c.data.description)).toContain('Coughing at night');
  expect(live('reminder').map((c) => c.data.title)).toEqual(
    expect.arrayContaining(['Breakfast', 'Order food']),
  );
  expect(live('expense')).toHaveLength(1);
  expect(live('contact').map((c) => c.data.name)).toEqual(['Dr Rao']);
  expect(changes.filter((c) => c.type === 'contact' && c.deletedAt !== null)).toHaveLength(1);

  const [document] = live('document');
  const download = await page.request.get(`/api/files/${String(document?.data.fileId)}`);
  expect(download.status()).toBe(200);
});
