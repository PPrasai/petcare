import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addPet, signUp, waitSynced } from './support/app';

// A real 1x1 PNG, so the server's content sniffing accepts it.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type Change = { type: string; deletedAt: string | null; data: Record<string, unknown> };
const pulled = async (page: Page, type: string): Promise<Change[]> => {
  const pull = await (await page.request.get('/api/sync/pull')).json();
  return pull.changes.filter((c: Change) => c.type === type && c.deletedAt === null);
};

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Log something' });
const openSheet = async (page: Page) => {
  await page.getByTestId('log-open').click();
  await expect(sheet(page)).toBeVisible();
};
const toast = (page: Page, text: string) => page.locator('.toast').filter({ hasText: text });

// QA-27: one Log control and one sheet, nine kinds, and the sheet behaves as a modal dialog.
for (const [label, viewport] of [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test(`${label}: exactly one visible Log control that opens the sheet, which traps focus`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await signUp(page, `log-${label}`);
    await addPet(page, 'Momo');

    await expect(page.getByTestId('log-open')).toHaveCount(1);
    await expect(page.getByTestId('log-open').filter({ visible: true })).toHaveCount(1);

    await openSheet(page);
    // The nine kinds in the mock's order, and nothing else.
    const kinds = sheet(page).locator('.types button');
    await expect(kinds).toHaveText([
      'Meal',
      'Walk',
      'Medication',
      'Grooming',
      'Weight',
      'Note',
      'Expense',
      'Vet visit',
      'Photo',
    ]);

    // Focus stays inside the dialog however far the user tabs.
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      expect(
        await sheet(page).evaluate(
          (d) => d.contains(document.activeElement) || document.activeElement === document.body,
        ),
        'focus left the dialog for the page behind it',
      ).toBe(true);
    }

    // A bottom sheet on a phone, centred on a desktop.
    const box = await sheet(page).locator('.sheet').boundingBox();
    expect(box).not.toBeNull();
    if (box && label === 'phone') {
      expect(Math.round(box.y + box.height)).toBe(viewport.height);
      expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
    } else if (box) {
      expect(box.y).toBeGreaterThan(0);
      expect(box.y + box.height).toBeLessThan(viewport.height);
      expect(box.width).toBeLessThan(viewport.width);
    }

    // Escape closes it and focus goes back to the control that opened it.
    await page.keyboard.press('Escape');
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.getByTestId('log-open')).toBeFocused();
  });
}

test('each kind writes the right record and offers a way back', async ({ page }) => {
  await signUp(page, 'log-kinds');
  await addPet(page, 'Momo');
  await waitSynced(page);

  // Weight: the stepper starts from a default and moves in steps of 0.1.
  await openSheet(page);
  await sheet(page).getByRole('button', { name: 'Weight', exact: true }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Weight for Momo' })).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Raise by 0.1' }).click();
  await sheet(page).getByRole('button', { name: 'Raise by 0.1' }).click();
  await sheet(page).getByRole('button', { name: 'Save weight' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(toast(page, 'Saved Momo’s weight')).toBeVisible();

  // Note: a quick phrase fills the text.
  await openSheet(page);
  await sheet(page).getByRole('button', { name: 'Note', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Limping' }).click();
  await sheet(page).getByRole('button', { name: 'Save note' }).click();
  await expect(toast(page, 'Note saved for Momo')).toBeVisible();

  // An empty note is refused with a message and the sheet stays open.
  await openSheet(page);
  await sheet(page).getByRole('button', { name: 'Note', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Save note' }).click();
  await expect(sheet(page).getByText('Write a short note first')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Back' }).click();
  await expect(sheet(page).locator('.types button')).toHaveCount(9);
  await page.keyboard.press('Escape');

  // Expense.
  await openSheet(page);
  await sheet(page).getByRole('button', { name: 'Expense', exact: true }).click();
  await sheet(page).getByLabel('Amount').fill('12.50');
  await sheet(page).getByRole('button', { name: 'Vet', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Save expense' }).click();
  await expect(sheet(page)).toHaveCount(0);

  // "More" shows the other five categories, so none is lost (PO-002 Q-12).
  await openSheet(page);
  await sheet(page).getByRole('button', { name: 'Expense', exact: true }).click();
  const more = sheet(page).getByRole('button', { name: 'More', exact: true });
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  const extra = sheet(page).getByRole('group', { name: 'More categories' });
  await expect(extra.getByRole('button')).toHaveText([
    'Supplies',
    'Medication',
    'Boarding',
    'Training',
    'Other',
  ]);
  await extra.getByRole('button', { name: 'Boarding' }).click();
  await sheet(page).getByLabel('Amount').fill('30');
  await sheet(page).getByRole('button', { name: 'Save expense' }).click();
  await expect(sheet(page)).toHaveCount(0);

  // Vet visit.
  await openSheet(page);
  await sheet(page).getByRole('button', { name: 'Vet visit', exact: true }).click();
  await sheet(page).getByLabel('Reason').fill('Annual check-up');
  await sheet(page).getByRole('button', { name: 'Save visit' }).click();
  await expect(toast(page, 'Vet visit added for Momo')).toBeVisible();

  // Meal: with a quantity and "Remember as a preset" (on by default) it also makes a preset.
  await openSheet(page);
  await sheet(page).getByRole('button', { name: 'Meal', exact: true }).click();
  await sheet(page).getByLabel('Food').fill('Salmon kibble');
  await sheet(page).getByLabel('Quantity').fill('300');
  await sheet(page).getByRole('button', { name: 'Save meal' }).click();
  await expect(toast(page, 'Logged a meal for Momo')).toBeVisible();

  // Walk: one tap on a length saves.
  await openSheet(page);
  await sheet(page).getByRole('button', { name: 'Walk', exact: true }).click();
  await sheet(page).getByRole('button', { name: '45 min' }).click();
  await expect(toast(page, 'Logged a 45 minute walk for Momo')).toBeVisible();

  // Grooming: nothing picked is refused; two tasks and a note save.
  await openSheet(page);
  await sheet(page).getByRole('button', { name: 'Grooming', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Save grooming' }).click();
  await expect(sheet(page).getByText('Pick at least one thing you did')).toBeVisible();
  await sheet(page).getByRole('button', { name: 'Bath', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Ears', exact: true }).click();
  await sheet(page).getByLabel('Note (optional)').fill('Used the oatmeal shampoo');
  await sheet(page).getByRole('button', { name: 'Save grooming' }).click();
  await expect(toast(page, 'Grooming logged for Momo.')).toBeVisible();

  // Medication with no matching task: only the log is written.
  await openSheet(page);
  await sheet(page).getByRole('button', { name: 'Medication', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Save medication' }).click();
  await expect(sheet(page).getByText('Add the medication name')).toBeVisible();
  await sheet(page).getByLabel('Medication', { exact: true }).fill('Fish oil');
  await sheet(page).getByRole('button', { name: 'Topical' }).click();
  await sheet(page).getByLabel('Dose (optional)').fill('1 tablet');
  await sheet(page).getByRole('button', { name: 'Save medication' }).click();
  await expect(toast(page, 'Logged Fish oil for Momo.')).toBeVisible();

  // Photo.
  await openSheet(page);
  await sheet(page).getByRole('button', { name: 'Photo', exact: true }).click();
  await sheet(page).getByLabel('Choose a photo').setInputFiles({
    name: 'momo.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(toast(page, 'New photo for Momo')).toBeVisible();

  await waitSynced(page);
  const weights = (await pulled(page, 'measurement')).filter((c) => c.data.kind === 'weight');
  expect(weights).toHaveLength(1);
  expect((await pulled(page, 'symptomEntry')).map((c) => c.data.description)).toEqual(['Limping']);
  const expenses = await pulled(page, 'expense');
  expect(expenses.map((e) => e.data.category).sort()).toEqual(['boarding', 'vet']);
  expect((await pulled(page, 'vetVisit')).map((c) => c.data.reason)).toEqual(['Annual check-up']);
  const documents = await pulled(page, 'document');
  expect(documents).toHaveLength(1);
  expect(documents[0]?.data.category).toBe('photo');

  const logs = await pulled(page, 'careLog');
  expect(logs.map((l) => l.data.kind).sort()).toEqual(['grooming', 'meal', 'medication', 'walk']);
  const byKind = (kind: string) => logs.find((l) => l.data.kind === kind)?.data;
  expect(byKind('meal')).toMatchObject({
    foodName: 'Salmon kibble',
    quantity: 300,
    quantityUnit: 'g',
  });
  expect(byKind('walk')).toMatchObject({ durationMin: 45 });
  expect(byKind('grooming')).toMatchObject({
    groomingTasks: ['bath', 'ears'],
    note: 'Used the oatmeal shampoo',
  });
  expect(byKind('medication')).toMatchObject({
    medicationName: 'Fish oil',
    route: 'topical',
    doseText: '1 tablet',
  });
  expect(byKind('medication')?.medicationId).toBeUndefined();
  expect((await pulled(page, 'mealPreset')).map((p) => p.data.foodName)).toEqual(['Salmon kibble']);
  expect(await pulled(page, 'medicationDose')).toHaveLength(0);

  // Recent activity on Health shows them, newest first, with who.
  await page.getByRole('tab', { name: 'Health' }).click();
  const activity = page.getByTestId('activity-row');
  await expect(activity.first()).toContainText('Medication: Fish oil (Topical), 1 tablet');
  await expect(activity.first()).toContainText('You');
  await expect(activity.filter({ hasText: 'Walk, 45 min' })).toBeVisible();
  await expect(activity.filter({ hasText: 'Meal: Salmon kibble, 300 g' })).toBeVisible();
  await expect(
    activity.filter({ hasText: 'Grooming: Bath, Ears. Used the oatmeal shampoo' }),
  ).toBeVisible();
});

// QA-29: a medication log checks off the open dose of the same medication, and Undo takes both back.
test('a medication log checks off the matching dose, and Undo deletes both records', async ({
  page,
}) => {
  await signUp(page, 'log-med');
  await addPet(page, 'Momo');
  await page.getByRole('tab', { name: 'Health' }).click();
  await page.getByRole('button', { name: 'Add a medication' }).click();
  await page.getByLabel('Medication', { exact: true }).fill('Carprofen');
  await page.getByLabel('Times (24-hour, comma separated)').fill('09:00');
  await page.getByRole('button', { name: 'Add medication' }).click();
  const doses = page.getByRole('list', { name: 'Doses of Carprofen' });
  await expect(doses.getByRole('listitem').first()).toBeVisible();

  const logCarprofen = async () => {
    await openSheet(page);
    await sheet(page).getByRole('button', { name: 'Medication', exact: true }).click();
    // The pet's current medication is offered as a chip.
    await expect(
      sheet(page).getByRole('group', { name: 'Current medications' }).getByRole('button'),
    ).toHaveText(['Carprofen']);
    await sheet(page).getByLabel('Medication', { exact: true }).fill('Carprofen 25mg');
    await sheet(page).getByRole('button', { name: 'Save medication' }).click();
  };

  await logCarprofen();
  await expect(toast(page, 'Logged Carprofen 25mg and checked off “Carprofen”.')).toBeVisible();
  await expect(doses.getByText('Given', { exact: true })).toHaveCount(1);

  // Undo deletes the log and the dose.
  await toast(page, 'checked off').getByRole('button', { name: 'Undo' }).click();
  await expect(doses.getByText('Given', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('activity-row')).toHaveCount(0);

  await logCarprofen();
  await expect(doses.getByText('Given', { exact: true })).toHaveCount(1);
  await waitSynced(page);
  const logs = await pulled(page, 'careLog');
  expect(logs).toHaveLength(1);
  const doseRecords = await pulled(page, 'medicationDose');
  expect(doseRecords).toHaveLength(1);
  expect(logs[0]?.data.medicationId).toBe(doseRecords[0]?.data.medicationId);

  // A name shorter than three characters never checks anything off.
  await openSheet(page);
  await sheet(page).getByRole('button', { name: 'Medication', exact: true }).click();
  await sheet(page).getByLabel('Medication', { exact: true }).fill('Ca');
  await sheet(page).getByRole('button', { name: 'Save medication' }).click();
  await expect(toast(page, 'Logged Ca for Momo.')).toBeVisible();
  await waitSynced(page);
  expect(await pulled(page, 'careLog')).toHaveLength(2);
  expect(await pulled(page, 'medicationDose')).toHaveLength(1);
});

test('"remind me again" adds a once reminder of the right category', async ({ page }) => {
  await signUp(page, 'log-again');
  await addPet(page, 'Momo');
  await openSheet(page);
  await sheet(page).getByRole('button', { name: 'Grooming', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Bath', exact: true }).click();
  await sheet(page).getByLabel('Remind me again (optional)').selectOption('In 1 week');
  await sheet(page).getByRole('button', { name: 'Save grooming' }).click();
  await expect(toast(page, 'Reminder set for')).toBeVisible();

  await page.getByRole('tab', { name: 'Care' }).click();
  await expect(page.getByTestId('reminder-row').filter({ hasText: 'Bath' })).toBeVisible();
  await waitSynced(page);
  const reminders = await pulled(page, 'reminder');
  expect(reminders).toHaveLength(1);
  expect(reminders[0]?.data).toMatchObject({
    category: 'grooming',
    title: 'Bath',
    schedule: { kind: 'once', times: ['09:00'] },
  });
});

test('the profile opens the sheet on the weight form for that pet', async ({ page }) => {
  await signUp(page, 'log-preset');
  await addPet(page, 'Momo');
  await addPet(page, 'Biralo');
  await page.getByRole('button', { name: 'Log weight' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Weight for Biralo' })).toBeVisible();
  await expect(page.getByTestId('log-open')).toHaveCount(1);
});
