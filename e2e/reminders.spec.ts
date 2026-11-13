import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addPet, addReminder, pushRoutine, signUp, waitSynced } from './support/app';

// P4: CAP-07 (create, edit, delete) and CAP-10 on the Care tab, with shapes that exist since
// increment 1 (no category, notBefore, audienceUserId or yearly: R-2).
type Change = { type: string; deletedAt: string | null; data: Record<string, unknown> };
const live = async (page: Page, type: string): Promise<Change[]> => {
  const pull = await (await page.request.get('/api/sync/pull')).json();
  return pull.changes.filter((c: Change) => c.type === type && c.deletedAt === null);
};

const rowOf = (page: Page, title: string) =>
  page.getByTestId('reminder-row').filter({ hasText: title });
const sheet = (page: Page, name: string) => page.getByRole('dialog', { name });

async function careTab(page: Page, label: string) {
  await signUp(page, label);
  await addPet(page, 'Momo');
  await page.getByRole('tab', { name: 'Care' }).click();
}

test('a reminder is created with each repeat, edited, switched off and deleted', async ({
  page,
}) => {
  await careTab(page, 'rem-crud');
  await expect(
    page
      .locator('.empty')
      .getByText('No reminders yet. Add one for walks, medication, grooming or anything else.'),
  ).toBeVisible();

  await addReminder(page, { title: 'Walk', repeat: 'Daily', time: '18:00', time2: '07:30' });
  await expect(rowOf(page, 'Walk')).toContainText('Daily at 18:00 and 07:30');
  await expect(page.locator('.toast')).toContainText('Reminder set for Momo: Walk, Daily at 18:00');

  await addReminder(page, {
    title: 'Brush',
    repeat: 'Weekly',
    days: ['Sat', 'Mon'],
    time: '10:00',
  });
  await expect(rowOf(page, 'Brush')).toContainText('Mon, Sat at 10:00');

  await addReminder(page, {
    title: 'Flea treatment',
    repeat: 'Monthly',
    date: '2031-03-17',
    time: '09:00',
  });
  await expect(rowOf(page, 'Flea treatment')).toContainText('Monthly from');
  await addReminder(page, { title: 'Vet call', repeat: 'Once', date: '2031-04-02', time: '11:15' });
  await expect(rowOf(page, 'Vet call')).toContainText('at 11:15');

  // Edit: the sheet opens filled in and saves the change.
  await page.getByRole('button', { name: 'Edit reminder: Walk' }).click();
  const edit = sheet(page, 'Edit reminder');
  await expect(edit.getByLabel('Reminder name')).toHaveValue('Walk');
  await expect(edit.getByLabel('Second time (optional)')).toHaveValue('07:30');
  await edit.getByLabel('Reminder name').fill('Evening walk');
  await edit.getByLabel('Second time (optional)').fill('');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  await expect(rowOf(page, 'Evening walk')).toContainText('Daily at 18:00');
  await expect(rowOf(page, 'Evening walk')).not.toContainText('07:30');

  // Switch off and on.
  const toggle = page.getByRole('switch', { name: 'Evening walk reminder' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await expect(rowOf(page, 'Evening walk')).toContainText('Paused');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  // Delete.
  await page.getByRole('button', { name: 'Edit reminder: Vet call' }).click();
  await sheet(page, 'Edit reminder').getByRole('button', { name: 'Delete reminder' }).click();
  await expect(rowOf(page, 'Vet call')).toHaveCount(0);

  // Only fields that existed in increment 1 are written.
  await waitSynced(page);
  const reminders = await live(page, 'reminder');
  expect(reminders.map((r) => r.data.title).sort()).toEqual([
    'Brush',
    'Evening walk',
    'Flea treatment',
  ]);
  for (const r of reminders) {
    expect(Object.keys(r.data).sort()).toEqual(['active', 'petId', 'schedule', 'title']);
  }
  const walk = reminders.find((r) => r.data.title === 'Evening walk');
  expect((walk?.data.schedule as { times: string[] }).times).toEqual(['18:00']);
});

test('the sheet asks for a name and for a weekday', async ({ page }) => {
  await careTab(page, 'rem-invalid');
  await page.getByRole('button', { name: /^Add a reminder for/ }).click();
  const form = sheet(page, 'New reminder');
  await form.getByRole('button', { name: 'Save reminder' }).click();
  await expect(form.getByText('Name the reminder')).toBeVisible();
  await expect(form.getByLabel('Reminder name')).toBeFocused();
  await form.getByLabel('Reminder name').fill('Brush');
  await form.getByRole('group', { name: 'Repeat' }).getByRole('button', { name: 'Weekly' }).click();
  await form.getByRole('button', { name: 'Save reminder' }).click();
  await expect(form.getByText('Pick at least one day.')).toBeVisible();
  await form.getByRole('button', { name: 'Close' }).click();
  await expect(rowOf(page, 'Brush')).toHaveCount(0);
});

test('a routine from an older version can be edited and paused, and a meal stays off Home', async ({
  page,
}) => {
  await careTab(page, 'rem-legacy');
  await pushRoutine(page, { title: 'Evening walk', kind: 'walk' });
  await pushRoutine(page, { title: 'Breakfast', kind: 'feeding' });
  await page.getByRole('tab', { name: 'Care' }).click();

  // The walk is a task and is listed with the reminders; the meal is neither.
  await expect(page.locator('.task').filter({ hasText: 'Evening walk' }).first()).toContainText(
    'Overdue',
  );
  await expect(rowOf(page, 'Evening walk')).toBeVisible();
  await expect(page.locator('.task').filter({ hasText: 'Breakfast' })).toHaveCount(0);
  await expect(rowOf(page, 'Breakfast')).toHaveCount(0);

  // The meal sits in the Feeding disclosure.
  await page.locator('summary').filter({ hasText: 'Feeding' }).click();
  await expect(rowOf(page, 'Breakfast')).toBeVisible();

  // Edit the walk: title and schedule.
  await page.getByRole('button', { name: 'Edit routine: Evening walk' }).click();
  const edit = sheet(page, 'Edit routine');
  await edit.getByLabel('Reminder name').fill('Long walk');
  await edit.getByLabel('Time', { exact: true }).fill('17:45');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(rowOf(page, 'Long walk')).toContainText('Daily at 17:45');
  await page.getByRole('switch', { name: 'Long walk reminder' }).click();
  await expect(rowOf(page, 'Long walk')).toContainText('Paused');
  await waitSynced(page);
  const [routine] = (await live(page, 'careRoutine')).filter((r) => r.data.title === 'Long walk');
  expect(routine?.data.active).toBe(false);
  expect(routine?.data.kind).toBe('walk');

  // With the walk paused, only the meal is overdue, and a meal is not ranked: Home is quiet.
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  const row = page.getByTestId('pet-row').filter({ hasText: 'Momo' });
  await expect(row).not.toContainText('Overdue');
  await expect(row).not.toContainText('Breakfast');
  await row.click();
  await expect(page.getByRole('heading', { name: 'Up next' })).toBeVisible();
  await expect(page.locator('.task').filter({ hasText: 'Breakfast' })).toHaveCount(0);
});
