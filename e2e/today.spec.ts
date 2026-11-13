import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addPet, addReminder, pushRoutine, signUp, waitSynced } from './support/app';

type Change = { type: string; data: Record<string, unknown> };
const pulled = async (page: import('@playwright/test').Page, type: string): Promise<Change[]> => {
  const pull = await (await page.request.get('/api/sync/pull')).json();
  return pull.changes.filter((c: Change) => c.type === type);
};

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

test('reminders and a legacy routine show on the Care tab and can be done, skipped or snoozed', async ({
  page,
}) => {
  await signUp(page, 'today');
  await expect(page.getByText('Add a pet to get started.')).toBeVisible();
  await addPet(page, 'Momo');

  await page.getByRole('tab', { name: 'Care' }).click();
  for (const title of ['Breakfast', 'Buy dog food']) {
    await addReminder(page, { title, repeat: 'Daily', time: '00:01' });
    await expect(page.getByRole('listitem').filter({ hasText: title }).first()).toBeVisible();
  }
  // A routine made by an increment-1 client is still listed and can be skipped.
  await pushRoutine(page, { title: 'Evening walk', kind: 'walk' });
  await page.getByRole('tab', { name: 'Care' }).click();
  await expect(page.getByTestId('reminder-row').filter({ hasText: 'Evening walk' })).toBeVisible();

  // A reminder that was due only yesterday is overdue from yesterday.
  await addReminder(page, { title: 'Medicine drops', repeat: 'Once', daysAgo: 1, time: '00:01' });

  await expect(task(page, 'Medicine drops')).toContainText('Overdue');
  await expect(task(page, 'Breakfast')).toContainText('Overdue');

  await act(page, 'Breakfast', 'Done');
  await expect(task(page, 'Breakfast')).toContainText('Done by you');

  await act(page, 'Evening walk', 'Skip');
  await expect(task(page, 'Evening walk')).toContainText('Skipped by you');

  await act(page, 'Medicine drops', 'Snooze until tomorrow');
  await expect(task(page, 'Medicine drops')).toContainText('Snoozed until');

  await act(page, 'Buy dog food', 'Done');
  await expect(task(page, 'Buy dog food')).toContainText('Done by you');

  await waitSynced(page);
  expect(await pulled(page, 'careRoutine')).toHaveLength(1);
  expect(await pulled(page, 'reminder')).toHaveLength(3);
  const completions = await pulled(page, 'careCompletion');
  expect(completions.map((c) => c.data.skipped)).toEqual([true]);
  expect(await pulled(page, 'reminderCompletion')).toHaveLength(2);
  const [snooze] = await pulled(page, 'reminderSnooze');
  expect(snooze?.data.sourceType).toBe('reminder');
});

test('Up next shows the next task, and the Care tab works offline', async ({ page, context }) => {
  await signUp(page, 'todayoff');
  await addPet(page, 'Momo');
  await page.getByRole('tab', { name: 'Care' }).click();
  await addReminder(page, { title: 'Brush teeth', repeat: 'Daily', time: '00:01' });
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
