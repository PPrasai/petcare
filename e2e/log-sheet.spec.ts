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

// QA-27: one Log control and one sheet, five kinds, and the sheet behaves as a modal dialog.
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
    // The five kinds, and nothing else.
    const kinds = sheet(page).locator('.types button');
    await expect(kinds).toHaveText(['Weight', 'Note', 'Expense', 'Vet visit', 'Photo']);

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
  await expect(sheet(page).locator('.types button')).toHaveCount(5);
  await page.keyboard.press('Escape');

  // Expense.
  await openSheet(page);
  await sheet(page).getByRole('button', { name: 'Expense', exact: true }).click();
  await sheet(page).getByLabel('Amount').fill('12.50');
  await sheet(page).getByRole('button', { name: 'Vet', exact: true }).click();
  await sheet(page).getByRole('button', { name: 'Save expense' }).click();
  await expect(sheet(page)).toHaveCount(0);

  // Vet visit.
  await openSheet(page);
  await sheet(page).getByRole('button', { name: 'Vet visit', exact: true }).click();
  await sheet(page).getByLabel('Reason').fill('Annual check-up');
  await sheet(page).getByRole('button', { name: 'Save visit' }).click();
  await expect(toast(page, 'Vet visit added for Momo')).toBeVisible();

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
  expect(expenses).toHaveLength(1);
  expect(expenses[0]?.data.category).toBe('vet');
  expect((await pulled(page, 'vetVisit')).map((c) => c.data.reason)).toEqual(['Annual check-up']);
  const documents = await pulled(page, 'document');
  expect(documents).toHaveLength(1);
  expect(documents[0]?.data.category).toBe('photo');
});

test('the profile opens the sheet on the weight form for that pet', async ({ page }) => {
  await signUp(page, 'log-preset');
  await addPet(page, 'Momo');
  await addPet(page, 'Biralo');
  await page.getByRole('button', { name: 'Log weight' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Weight for Biralo' })).toBeVisible();
  await expect(page.getByTestId('log-open')).toHaveCount(1);
});
