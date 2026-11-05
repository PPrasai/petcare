import { expect, test } from '@playwright/test';
import { addPet, signUp, waitSynced } from './support/app';

type Change = { type: string; data: Record<string, unknown> };
const pulled = async (page: import('@playwright/test').Page, type: string): Promise<Change[]> => {
  const pull = await (await page.request.get('/api/sync/pull')).json();
  return pull.changes.filter((c: Change) => c.type === type);
};

const dayBefore = (iso: string) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

// CAP-10: care routines and the daily checklist. CAP-07 (in-app): done, snooze, custom reminders.
test('routines and reminders show on Today and can be done, skipped or snoozed', async ({
  page,
}) => {
  await signUp(page, 'today');
  await expect(page.getByText('Nothing is due.')).toBeVisible();
  await addPet(page, 'Momo');

  await page.getByRole('link', { name: 'Care routines' }).click();
  for (const title of ['Breakfast', 'Evening walk']) {
    await page.getByLabel('Routine name').fill(title);
    await page.getByLabel('Times (24-hour, comma separated)').fill('00:01');
    await page.getByRole('button', { name: 'Add routine' }).click();
    await expect(page.getByRole('listitem').filter({ hasText: title })).toBeVisible();
  }

  // A routine that started yesterday has an overdue occurrence from yesterday.
  const start = await page.getByLabel('Starts on').inputValue();
  await page.getByLabel('Routine name').fill('Medicine drops');
  await page.getByLabel('Times (24-hour, comma separated)').fill('00:01');
  await page.getByLabel('Starts on').fill(dayBefore(start));
  await page.getByLabel('Ends on (optional)').fill(dayBefore(start));
  await page.getByRole('button', { name: 'Add routine' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Medicine drops' })).toBeVisible();

  await page.getByRole('link', { name: 'Today', exact: true }).click();
  const overdue = page.getByRole('region', { name: /Overdue/ });
  await expect(overdue.getByText('Medicine drops')).toBeVisible();
  const due = page.getByRole('region', { name: /Due today/ });
  await expect(due.getByText('Breakfast')).toBeVisible();

  await page.getByRole('button', { name: 'Mark Breakfast (Momo) done' }).click();
  const done = page.getByRole('region', { name: /Done today/ });
  await expect(done.getByText('Breakfast')).toBeVisible();
  await expect(done.getByText(/done by you/)).toBeVisible();
  await expect(due.getByText('Breakfast')).toHaveCount(0);

  await page.getByRole('button', { name: 'Skip Evening walk (Momo)' }).click();
  await expect(done.getByText(/skipped by you/)).toBeVisible();

  await page.getByRole('button', { name: 'Snooze until tomorrow: Medicine drops (Momo)' }).click();
  await expect(
    page.getByRole('region', { name: /Snoozed/ }).getByText('Medicine drops'),
  ).toBeVisible();
  await expect(overdue).toHaveCount(0);

  // A custom reminder without a pet.
  await page.getByLabel('Reminder', { exact: true }).fill('Buy dog food');
  await page.getByLabel('Times (24-hour, comma separated)').fill('00:01');
  await page.getByRole('button', { name: 'Add reminder' }).click();
  await page.getByRole('button', { name: 'Mark Buy dog food done' }).click();
  await expect(done.getByText('Buy dog food')).toBeVisible();

  await waitSynced(page);
  expect(await pulled(page, 'careRoutine')).toHaveLength(3);
  const completions = await pulled(page, 'careCompletion');
  expect(completions.map((c) => c.data.skipped).sort()).toEqual([false, true]);
  expect(await pulled(page, 'reminderCompletion')).toHaveLength(1);
  const [snooze] = await pulled(page, 'reminderSnooze');
  expect(snooze?.data.sourceType).toBe('careRoutine');
});

test('the Today page works offline and filters by pet', async ({ page, context }) => {
  await signUp(page, 'todayoff');
  await addPet(page, 'Momo');
  await page.getByRole('link', { name: 'Care routines' }).click();
  await page.getByLabel('Routine name').fill('Brush teeth');
  await page.getByLabel('Times (24-hour, comma separated)').fill('00:01');
  await page.getByRole('button', { name: 'Add routine' }).click();
  await addPet(page, 'Biralo');
  await waitSynced(page);

  await context.setOffline(true);
  await page.reload();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  await expect(
    page.getByRole('region', { name: /Due today/ }).getByText('Brush teeth'),
  ).toBeVisible();
  await page.getByLabel('Show').selectOption({ label: 'Biralo' });
  await expect(
    page.getByRole('region', { name: /Due today/ }).getByText('Brush teeth'),
  ).toHaveCount(0);
  await page.getByLabel('Show').selectOption({ label: 'Momo' });
  await page.getByRole('button', { name: 'Mark Brush teeth (Momo) done' }).click();
  await expect(page.getByTestId('pending-count')).toHaveAttribute('data-count', '1');
  await context.setOffline(false);
  await waitSynced(page);
  expect(await pulled(page, 'careCompletion')).toHaveLength(1);
});
