import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addPet, openDisclosure, signUp, waitSynced } from './support/app';

type Change = { type: string; deletedAt: string | null; data: Record<string, unknown> };
const pulled = async (page: Page, type: string): Promise<Change[]> => {
  const pull = await (await page.request.get('/api/sync/pull')).json();
  return pull.changes.filter((c: Change) => c.type === type && c.deletedAt === null);
};

const sheet = (page: Page) => page.getByRole('dialog', { name: 'Log something' });
const openMeal = async (page: Page) => {
  await page.getByTestId('log-open').filter({ visible: true }).click();
  await sheet(page).getByRole('button', { name: 'Meal', exact: true }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Meal for Momo' })).toBeVisible();
};
const logMeal = async (page: Page, food: string, quantity: string, unit = 'g') => {
  await openMeal(page);
  await sheet(page).getByLabel('Unit').selectOption(unit);
  await sheet(page).getByLabel('Food').fill(food);
  await sheet(page).getByLabel('Quantity').fill(quantity);
  await sheet(page).getByRole('button', { name: 'Save meal' }).click();
  await expect(sheet(page)).toHaveCount(0);
};

// QA-28: presets from "Remember as a preset", the four-preset limit, one-tap logging, the unit.
test('meal presets: saved, limited to the four newest, logged in three taps, unit remembered', async ({
  page,
}) => {
  await signUp(page, 'presets');
  await addPet(page, 'Momo');

  // No presets yet: the form has only the fields.
  await openMeal(page);
  await expect(sheet(page).getByTestId('meal-preset')).toHaveCount(0);
  await page.keyboard.press('Escape');

  for (const [food, quantity] of [
    ['Food A', '100'],
    ['Food B', '110'],
    ['Food C', '120'],
    ['Food D', '130'],
  ] as const) {
    await logMeal(page, food, quantity);
  }
  await openMeal(page);
  await expect(sheet(page).getByTestId('meal-preset')).toHaveText([
    /Food D\s*130 g/,
    /Food C\s*120 g/,
    /Food B\s*110 g/,
    /Food A\s*100 g/,
  ]);
  await page.keyboard.press('Escape');

  // The fifth hides the oldest, and the unit chosen last is remembered.
  await openMeal(page);
  await sheet(page).getByLabel('Food').fill('Food E');
  await sheet(page).getByLabel('Quantity').fill('1');
  await sheet(page).getByLabel('Unit').selectOption('pouch');
  await sheet(page).getByRole('button', { name: 'Save meal' }).click();
  await expect(sheet(page)).toHaveCount(0);
  await openMeal(page);
  await expect(sheet(page).getByTestId('meal-preset')).toHaveText([
    /Food E\s*1 pouch/,
    /Food D\s*130 g/,
    /Food C\s*120 g/,
    /Food B\s*110 g/,
  ]);
  await expect(sheet(page).getByLabel('Unit')).toHaveValue('pouch');
  await page.keyboard.press('Escape');

  // Saving the same meal again does not make a second preset.
  await logMeal(page, 'Food D', '130');
  await waitSynced(page);
  expect(await pulled(page, 'mealPreset')).toHaveLength(5);
  expect(await pulled(page, 'careLog')).toHaveLength(6);

  // From another route, a preset logs in three interactions: Log, Meal, the preset.
  await page.getByRole('link', { name: 'Expenses', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Expenses' })).toBeVisible();
  await page.getByTestId('log-open').filter({ visible: true }).click();
  await sheet(page).getByRole('button', { name: 'Meal', exact: true }).click();
  await sheet(page).getByTestId('meal-preset').filter({ hasText: 'Food C' }).click();
  await expect(
    page.locator('.toast').filter({ hasText: 'Logged Food C, 120 g for Momo' }),
  ).toBeVisible();
  await waitSynced(page);
  const logs = await pulled(page, 'careLog');
  expect(logs).toHaveLength(7);
  expect(logs.filter((l) => l.data.foodName === 'Food C')).toHaveLength(2);

  // The Feeding disclosure lists every preset and removes one.
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await page.getByTestId('pet-row').first().click();
  await page.getByRole('tab', { name: 'Care' }).click();
  await openDisclosure(page, 'Feeding');
  const rows = page.getByTestId('meal-preset-row');
  await expect(rows).toHaveCount(5);
  await page.getByRole('button', { name: 'Remove the Food A preset' }).click();
  await expect(rows).toHaveCount(4);
  await page.getByRole('button', { name: 'Log a meal for Momo' }).click();
  await expect(sheet(page).getByRole('heading', { name: 'Meal for Momo' })).toBeVisible();
  await expect(sheet(page).getByTestId('meal-preset')).toHaveCount(4);
  await waitSynced(page);
  expect((await pulled(page, 'mealPreset')).map((p) => p.data.foodName).sort()).toEqual([
    'Food B',
    'Food C',
    'Food D',
    'Food E',
  ]);
});
