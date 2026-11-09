import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addPet, signUp, waitSynced } from './support/app';

type Change = { type: string; data: Record<string, unknown> };
const pulled = async (page: import('@playwright/test').Page, type: string): Promise<Change[]> => {
  const pull = await (await page.request.get('/api/sync/pull')).json();
  return pull.changes.filter((c: Change) => c.type === type);
};

const dayBefore = (iso: string) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

// CAP-10: care routines and the daily checklist. CAP-07 (in-app): done, skip, snooze, custom
// reminders. The tasks live on the Care tab and in each pet's "Up next"; the "More actions" menu
// carries Done, Skip, Snooze 1 hour and Snooze until tomorrow.
const task = (page: Page, title: string) =>
  page.locator('.task').filter({ hasText: title }).first();
const act = async (page: Page, title: string, action: string) => {
  await page
    .getByLabel(new RegExp(`^More actions: ${title}`))
    .first()
    .click();
  await page.getByRole('button', { name: action, exact: true }).click();
};

test('routines and reminders show on the Care tab and can be done, skipped or snoozed', async ({
  page,
}) => {
  await signUp(page, 'today');
  await expect(page.getByText(/all caught up/)).toBeVisible();
  await addPet(page, 'Momo');

  await page.getByRole('tab', { name: 'Care' }).click();
  const routines = page.getByRole('region', { name: 'Care routines' });
  for (const title of ['Breakfast', 'Evening walk']) {
    await routines.getByLabel('Routine name').fill(title);
    await routines.getByLabel('Times (24-hour, comma separated)').fill('00:01');
    await routines.getByRole('button', { name: 'Add routine' }).click();
    await expect(routines.getByRole('listitem').filter({ hasText: title })).toBeVisible();
  }

  // A routine that started yesterday has an overdue occurrence from yesterday.
  const start = await routines.getByLabel('Starts on').inputValue();
  await routines.getByLabel('Routine name').fill('Medicine drops');
  await routines.getByLabel('Times (24-hour, comma separated)').fill('00:01');
  await routines.getByLabel('Starts on').fill(dayBefore(start));
  await routines.getByLabel('Ends on (optional)').fill(dayBefore(start));
  await routines.getByRole('button', { name: 'Add routine' }).click();
  await expect(routines.getByRole('listitem').filter({ hasText: 'Medicine drops' })).toBeVisible();

  await expect(task(page, 'Medicine drops')).toContainText('Overdue');
  await expect(task(page, 'Breakfast')).toContainText('Overdue');

  await act(page, 'Breakfast', 'Done');
  await expect(task(page, 'Breakfast')).toContainText('Done by you');

  await act(page, 'Evening walk', 'Skip');
  await expect(task(page, 'Evening walk')).toContainText('Skipped by you');

  await act(page, 'Medicine drops', 'Snooze until tomorrow');
  await expect(task(page, 'Medicine drops')).toContainText('Snoozed until');

  // A custom reminder without a pet.
  const reminders = page.getByRole('region', { name: 'Custom reminders' });
  await reminders.getByLabel('Reminder', { exact: true }).fill('Buy dog food');
  await reminders.getByLabel('Times (24-hour, comma separated)').fill('00:01');
  await reminders.getByRole('button', { name: 'Add reminder' }).click();
  await act(page, 'Buy dog food', 'Done');
  await expect(task(page, 'Buy dog food')).toContainText('Done by you');

  await waitSynced(page);
  expect(await pulled(page, 'careRoutine')).toHaveLength(3);
  const completions = await pulled(page, 'careCompletion');
  expect(completions.map((c) => c.data.skipped).sort()).toEqual([false, true]);
  expect(await pulled(page, 'reminderCompletion')).toHaveLength(1);
  const [snooze] = await pulled(page, 'reminderSnooze');
  expect(snooze?.data.sourceType).toBe('careRoutine');
});

test('Up next shows the next task, and the Care tab works offline', async ({ page, context }) => {
  await signUp(page, 'todayoff');
  await addPet(page, 'Momo');
  await page.getByRole('tab', { name: 'Care' }).click();
  const routines = page.getByRole('region', { name: 'Care routines' });
  await routines.getByLabel('Routine name').fill('Brush teeth');
  await routines.getByLabel('Times (24-hour, comma separated)').fill('00:01');
  await routines.getByRole('button', { name: 'Add routine' }).click();
  await addPet(page, 'Biralo');
  await waitSynced(page);

  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('pet-row').filter({ hasText: 'Momo' }).click();
  await expect(page.getByRole('heading', { name: 'Up next' })).toBeVisible();
  await expect(task(page, 'Brush teeth')).toBeVisible();
  await act(page, 'Brush teeth', 'Done');
  await expect(page.getByTestId('pending-count')).toHaveAttribute('data-count', '1');
  await page.getByRole('tab', { name: 'Care' }).click();
  await expect(task(page, 'Brush teeth')).toContainText('Done by you');

  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await page.getByTestId('pet-row').filter({ hasText: 'Biralo' }).click();
  await expect(page.locator('.task').filter({ hasText: 'Brush teeth' })).toHaveCount(0);
  await context.setOffline(false);
  await waitSynced(page);
  expect(await pulled(page, 'careCompletion')).toHaveLength(1);
});
