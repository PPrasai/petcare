import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addPet, openDisclosure, signUp, waitSynced } from './support/app';

// Editing existing records: vaccinations, medications, vet visits, measurements, symptoms,
// conditions, expenses, contacts and documents. Each is edited, saved, still there after a reload
// and on the server; then edited again with the server unreachable and synced when it is back.

// A real 1x1 PNG, so the server's content sniffing accepts it.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type Change = { type: string; id: string; deletedAt: string | null; data: Record<string, unknown> };
const pulled = async (page: Page, type: string): Promise<Change[]> => {
  const pull = await (await page.request.get('/api/sync/pull')).json();
  return (pull.changes as Change[]).filter((c) => c.type === type && c.deletedAt === null);
};
const one = async (page: Page, type: string) => (await pulled(page, type))[0]?.data ?? {};

const openPet = async (page: Page, tab: string) => {
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await page.getByTestId('pet-row').filter({ hasText: 'Momo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Momo' })).toBeVisible();
  await page.getByRole('tab', { name: tab, exact: true }).click();
};
const goContacts = async (page: Page) => {
  await page
    .getByRole('link', { name: 'Settings', exact: true })
    .or(page.getByRole('link', { name: 'More', exact: true }))
    .first()
    .click();
  await page.getByRole('link', { name: 'Contacts' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible();
};
const goExpenses = async (page: Page) => {
  await page.getByRole('link', { name: 'Expenses', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Expenses' })).toBeVisible();
};
const sheet = (page: Page, name: string) => page.getByRole('dialog', { name });

/** Creates one record of every type, online, and waits until the server has them. */
async function seed(page: Page) {
  await addPet(page, 'Momo');
  await page.getByRole('tab', { name: 'Health' }).click();

  await page.getByRole('button', { name: 'Add a vaccination' }).click();
  await page.getByLabel('Vaccine', { exact: true }).fill('Rabies');
  await page.getByLabel('Given on').fill('2025-01-15');
  await page.getByLabel('Batch number').fill('B-1');
  await page.getByRole('button', { name: 'Add vaccination' }).click();

  await page.getByRole('button', { name: 'Add a medication' }).click();
  await page.getByLabel('Medication', { exact: true }).fill('Amoxil');
  await page.getByLabel('Dose', { exact: true }).fill('5');
  await page.getByLabel('Dose unit').selectOption('mg');
  await page.getByLabel('Time', { exact: true }).fill('09:00');
  await page.getByRole('button', { name: 'Add medication' }).click();

  await openDisclosure(page, 'Vet visits');
  await page.getByRole('button', { name: 'Add a visit' }).click();
  await page.getByLabel('Visit date').fill('2026-02-10');
  await page.getByLabel('Reason').fill('Check');
  await page.getByLabel('Cost').fill('45.50');
  await page.getByRole('button', { name: 'Add visit' }).click();

  await page.getByRole('button', { name: 'Add a condition' }).click();
  await page.getByLabel('Condition name').fill('Chicken');
  await page.getByRole('button', { name: 'Add condition' }).click();

  await page.getByRole('button', { name: 'Add a symptom' }).click();
  await page.getByLabel('What you noticed').fill('Itchy ear');
  await page.getByRole('button', { name: 'Add symptom' }).click();

  await page.getByRole('button', { name: 'Add a measurement' }).click();
  await page.getByLabel(/^Value/).fill('12.5');
  await page.getByRole('button', { name: 'Add measurement' }).click();

  await page.getByRole('tab', { name: 'Files' }).click();
  await page.getByLabel('Choose a file').setInputFiles({
    name: 'cert.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await page.getByLabel('Title').fill('Certificate');
  await page.getByLabel('Category').selectOption('certificate');
  await page.getByRole('button', { name: 'Add document' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Certificate' })).toBeVisible();

  await goContacts(page);
  await page
    .getByRole('button', { name: /^Add (a )?contact$/ })
    .first()
    .click();
  await page.getByLabel('Name', { exact: true }).fill('Dr Rao');
  await page.getByLabel('Phone').fill('555-0101');
  await sheet(page, 'Add contact').getByRole('button', { name: 'Add contact' }).click();
  await expect(page.getByTestId('contact-row').filter({ hasText: 'Dr Rao' })).toBeVisible();

  await goExpenses(page);
  await page
    .getByRole('button', { name: /^Add (an? )?expense$/ })
    .first()
    .click();
  await page.getByLabel('Amount').fill('42.50');
  await sheet(page, 'Add expense').getByRole('button', { name: 'Add expense' }).click();
  await expect(page.getByTestId('expense-row').or(page.getByRole('listitem'))).not.toHaveCount(0);
  await waitSynced(page);
}

/** Edits the nine records. `n` makes the values differ from one round to the next. */
async function editAll(page: Page, n: number) {
  await openPet(page, 'Health');

  await page.getByRole('button', { name: /^Edit Rabies/ }).click();
  await expect(sheet(page, 'Edit vaccination').getByLabel('Vaccine', { exact: true })).toHaveValue(
    n === 1 ? 'Rabies' : 'Rabies edit1',
  );
  await page.getByLabel('Vaccine', { exact: true }).fill(`Rabies edit${n}`);
  await page.getByLabel('Batch number').fill(`B-${n + 1}`);
  await sheet(page, 'Edit vaccination').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: `Rabies edit${n}` })).toContainText(
    `Batch B-${n + 1}`,
  );

  const med = page.getByRole('button', { name: /^Edit Amoxil/ });
  await med.click();
  await expect(sheet(page, 'Edit medication').getByLabel('Dose', { exact: true })).toHaveValue(
    n === 1 ? '5' : '6',
  );
  await page.getByLabel('Medication', { exact: true }).fill(`Amoxil edit${n}`);
  await page.getByLabel('Dose', { exact: true }).fill(String(n + 5));
  await page.getByLabel('Time', { exact: true }).fill('10:30');
  await sheet(page, 'Edit medication').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('list', { name: 'Medications' })).toContainText(`Amoxil edit${n}`);

  await openDisclosure(page, 'Vet visits');
  await page
    .getByRole('list', { name: 'Vet visits' })
    .getByRole('button', { name: /^Edit / })
    .click();
  await page.getByLabel('Reason').fill(`Dental ${n}`);
  await page.getByLabel('Cost').fill(`${n}0.25`);
  await sheet(page, 'Edit visit').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('list', { name: 'Vet visits' })).toContainText(`Dental ${n}`);
  await expect(page.getByRole('list', { name: 'Vet visits' })).toContainText(`$${n}0.25`);

  await page.getByRole('button', { name: /^Edit Chicken|^Edit Beef/ }).click();
  await page.getByLabel('Condition name').fill(`Beef ${n}`);
  await page.getByLabel('Severity', { exact: true }).selectOption('moderate');
  await sheet(page, 'Edit condition').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('list', { name: 'Conditions and allergies' })).toContainText(
    `Beef ${n}`,
  );

  await page
    .getByRole('list', { name: 'Symptoms journal' })
    .getByRole('button', { name: /^Edit / })
    .click();
  await page.getByLabel('What you noticed').fill(`Itchy ear ${n}`);
  await sheet(page, 'Edit symptom').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('list', { name: 'Symptoms journal' })).toContainText(
    `Itchy ear ${n}`,
  );

  await openDisclosure(page, 'All measurements');
  await page
    .getByRole('button', { name: /^Edit Weight/ })
    .or(page.getByRole('cell', { name: /^Edit Weight/ }))
    .click();
  await page.getByLabel(/^Value/).fill(`1${n}.5`);
  await page.getByLabel('Note').fill(`note ${n}`);
  await sheet(page, 'Edit measurement').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('table', { name: 'All measurements' })).toContainText(`note ${n}`);

  await page.getByRole('tab', { name: 'Files' }).click();
  await page.getByRole('button', { name: /^Edit Certificate|^Edit Papers/ }).click();
  await page.getByLabel('Title').fill(`Papers ${n}`);
  await page.getByLabel('Category').selectOption('insurance');
  await sheet(page, 'Edit document').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: `Papers ${n}` })).toContainText(
    'Insurance',
  );

  await goContacts(page);
  await page
    .getByRole('button', { name: /^Edit Dr Rao/ })
    .first()
    .click();
  await page.getByLabel('Name', { exact: true }).fill(`Dr Rao ${n}`);
  await page.getByLabel('Phone').fill(`555-02${n}${n}`);
  await sheet(page, 'Edit contact').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId('contact-row').filter({ hasText: `Dr Rao ${n}` })).toBeVisible();

  await goExpenses(page);
  await page
    .getByRole('button', { name: /^Edit / })
    .first()
    .click();
  await page.getByLabel('Amount').fill(`${n}0.75`);
  await page.getByLabel('Note').fill(`Visit ${n}`);
  await sheet(page, 'Edit expense').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText(`$${n}0.75`).first()).toBeVisible();
}

/** What the server holds after round `n`. */
async function expectOnServer(page: Page, n: number) {
  await expect
    .poll(async () => (await one(page, 'vaccination')).vaccineName)
    .toBe(`Rabies edit${n}`);
  await expect.poll(() => one(page, 'vaccination')).toMatchObject({ batchNumber: `B-${n + 1}` });
  await expect
    .poll(() => one(page, 'medication'))
    .toMatchObject({ name: `Amoxil edit${n}`, dose: n + 5 });
  await expect
    .poll(() => one(page, 'vetVisit'))
    .toMatchObject({
      reason: `Dental ${n}`,
      costMinor: n * 1000 + 25,
    });
  await expect
    .poll(() => one(page, 'condition'))
    .toMatchObject({ name: `Beef ${n}`, severity: 'moderate' });
  await expect
    .poll(() => one(page, 'symptomEntry'))
    .toMatchObject({ description: `Itchy ear ${n}` });
  await expect
    .poll(() => one(page, 'measurement'))
    .toMatchObject({ value: 10 + n + 0.5, note: `note ${n}` });
  await expect
    .poll(() => one(page, 'document'))
    .toMatchObject({
      title: `Papers ${n}`,
      category: 'insurance',
    });
  await expect
    .poll(() => one(page, 'contact'))
    .toMatchObject({
      name: `Dr Rao ${n}`,
      phone: `555-02${n}${n}`,
    });
  await expect
    .poll(() => one(page, 'expense'))
    .toMatchObject({
      amountMinor: n * 1000 + 75,
      note: `Visit ${n}`,
    });
}

for (const [label, viewport] of [
  ['desktop', { width: 1280, height: 800 }],
  ['phone', { width: 390, height: 844 }],
] as const) {
  test(`${label}: every record type can be edited, saved and found again after a reload, then edited offline and synced`, async ({
    page,
    context,
  }) => {
    test.setTimeout(420_000);
    await page.setViewportSize(viewport);
    await signUp(page, `edit-${label}`);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await seed(page);

    // Online: edit everything, reload, and the edits are still there and on the server.
    await editAll(page, 1);
    await waitSynced(page);
    await page.reload();
    await openPet(page, 'Health');
    await expect(page.getByRole('list', { name: 'Medications' })).toContainText('Amoxil edit1');
    await expect(page.getByRole('list', { name: 'Conditions and allergies' })).toContainText(
      'Beef 1',
    );
    await expectOnServer(page, 1);

    // Offline: edit again; the app still answers, a reload keeps the edits, and sync sends them.
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);
    await context.setOffline(true);
    await editAll(page, 2);
    await expect(page.getByTestId('pending-count')).not.toHaveAttribute('data-count', '0');
    await page.reload();
    await openPet(page, 'Health');
    await expect(page.getByRole('list', { name: 'Medications' })).toContainText('Amoxil edit2');
    await context.setOffline(false);
    await waitSynced(page);
    await expectOnServer(page, 2);
  });
}

test('an edit sheet is labelled, keeps focus inside, closes on Escape and gives focus back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signUp(page, 'edit-a11y');
  await addPet(page, 'Momo');
  await page.getByRole('tab', { name: 'Health' }).click();
  await page.getByRole('button', { name: 'Add a vaccination' }).click();
  await page.getByLabel('Vaccine', { exact: true }).fill('Rabies');
  await page.getByLabel('Given on').fill('2025-01-15');
  await page.getByRole('button', { name: 'Add vaccination' }).click();

  const opener = page.getByRole('button', { name: 'Edit Rabies', exact: true });
  await opener.click();
  const dialog = sheet(page, 'Edit vaccination');
  await expect(dialog).toBeVisible();
  // Tab never leaves the dialog.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog[open]'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  // Unchanged values leave nothing to sync.
  await waitSynced(page);
  await opener.click();
  await sheet(page, 'Edit vaccination').getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByTestId('pending-count')).toHaveAttribute('data-count', '0');
});
