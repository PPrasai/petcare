import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addPet, signUp } from './support/app';

// QA-09: no serious or critical WCAG 2.1 AA violations on the main screens.
async function expectAccessible(page: Page, screen: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const summary = blocking.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
  );
  expect(summary, `${screen} has serious or critical violations`).toEqual([]);
}

test('sign-in page', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.getByRole('button', { name: 'Try the demo' })).toBeVisible();
  await expectAccessible(page, 'sign-in');
});

test('add pet, add vaccination, Today and reminders', async ({ page }) => {
  await signUp(page, 'a11y');
  await page.getByRole('link', { name: 'Pets', exact: true }).click();
  await page.getByRole('link', { name: 'Add a pet' }).click();
  await expect(page.getByLabel('Pet name')).toBeVisible();
  await expectAccessible(page, 'add pet');

  await page.getByLabel('Pet name').fill('Momo');
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Momo' })).toBeVisible();

  await page.getByRole('link', { name: 'Vaccinations' }).click();
  await page.getByLabel('Vaccine', { exact: true }).fill('Rabies');
  await page.getByLabel('Given on').fill('2024-03-01');
  await page.getByRole('button', { name: 'Add vaccination' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Rabies' })).toBeVisible();
  await expectAccessible(page, 'vaccinations');

  await page.getByRole('link', { name: 'Care routines' }).click();
  await expect(page.getByLabel('Routine name')).toBeVisible();
  await expectAccessible(page, 'care routines and reminders');

  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expectAccessible(page, 'today');
});

test('demo banner and the demo Today page', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByRole('region', { name: 'Demo mode' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  await expectAccessible(page, 'demo');
});

test('settings', async ({ page }) => {
  await signUp(page, 'a11y-settings');
  await addPet(page, 'Momo');
  await page.getByRole('link', { name: 'Settings' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expectAccessible(page, 'settings');
});
