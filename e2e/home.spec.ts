import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addPet, addReminder, signUp, waitSynced } from './support/app';

type Change = { type: string; deletedAt: string | null; data: Record<string, unknown> };
const liveCompletions = async (page: Page): Promise<number> => {
  const pull = await (await page.request.get('/api/sync/pull')).json();
  return pull.changes.filter((c: Change) => c.type === 'careCompletion' && c.deletedAt === null)
    .length;
};

const rows = (page: Page) => page.getByTestId('pet-row');

/** Adds reminders that fell due a minute past midnight today, so each is overdue now. */
async function addReminders(page: Page, pet: string, titles: string[]) {
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await rows(page).filter({ hasText: pet }).click();
  await page.getByRole('tab', { name: 'Care' }).click();
  for (const title of titles) {
    await addReminder(page, { title, repeat: 'Daily', time: '00:01' });
    await expect(page.getByTestId('reminder-row').filter({ hasText: title })).toBeVisible();
  }
}

/**
 * Momo has two daily reminders and one that was due only yesterday; Biralo has two daily reminders.
 * Momo leads by one overdue task, so a tick on Momo's top task ties them and the name would put
 * Biralo first, unless the order is held.
 */
async function twoPets(page: Page) {
  await signUp(page, 'home');
  await addPet(page, 'Momo');
  await addReminders(page, 'Momo', ['Breakfast', 'Evening walk']);
  await addReminder(page, { title: 'Medicine drops', repeat: 'Once', daysAgo: 1, time: '00:01' });
  await expect(
    page.getByTestId('reminder-row').filter({ hasText: 'Medicine drops' }),
  ).toBeVisible();
  await addPet(page, 'Biralo');
  await addReminders(page, 'Biralo', ['Supper', 'Brushing']);
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await expect(rows(page).first()).toContainText('Momo');
  await expect(rows(page).nth(1)).toContainText('Biralo');
}

const toast = (page: Page) => page.getByRole('status').filter({ hasText: 'Done:' });

// QA-26 / CAP-21 one-tap: tick the top task, it is done at once and the order holds while the
// Undo toast is open; Undo takes the record away; the new order shows when the toast is gone.
test('one tap checks the top task, holds the order, and Undo removes the completion', async ({
  page,
}) => {
  await twoPets(page);
  const momo = rows(page).filter({ hasText: 'Momo' });
  await momo.getByTestId('task-check').click();

  await expect(toast(page)).toContainText('Done: Medicine drops (Momo)');
  await expect(momo).toContainText('Done by you');
  await expect(momo.getByTestId('task-check')).toHaveAttribute('aria-pressed', 'true');
  // Held: with one task done the pets tie and Biralo would lead, because of its name, but the order does not move.
  await expect(rows(page).first()).toContainText('Momo');

  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect(toast(page)).toHaveCount(0);
  await expect(momo.getByTestId('task-check')).toHaveAttribute('aria-pressed', 'false');
  await waitSynced(page);
  expect(await liveCompletions(page)).toBe(0);
});

test('the record exists after a tap, and the order settles once the toast is gone', async ({
  page,
}) => {
  await twoPets(page);
  await rows(page).filter({ hasText: 'Momo' }).getByTestId('task-check').click();
  await expect(toast(page)).toContainText('Done: Medicine drops (Momo)');
  await expect(rows(page).first()).toContainText('Momo');
  // The toast stays 5 seconds; afterwards the tie is broken by name and Biralo leads.
  await expect(toast(page)).toHaveCount(0, { timeout: 10_000 });
  await expect(rows(page).first()).toContainText('Biralo');
  await waitSynced(page);
  expect(await liveCompletions(page)).toBe(1);
});

test('the same tap works offline and syncs on reconnect', async ({ page, context }) => {
  await twoPets(page);
  await waitSynced(page);
  await context.setOffline(true);
  await rows(page).filter({ hasText: 'Biralo' }).getByTestId('task-check').click();
  await expect(toast(page)).toContainText(/Done: .* \(Biralo\)/);
  await expect(page.getByTestId('pending-count')).not.toHaveAttribute('data-count', '0');
  await context.setOffline(false);
  await waitSynced(page);
  expect(await liveCompletions(page)).toBe(1);
});

// PO-002 Q-02 and the demo seed: four pets with mixed urgency, one of them with a photo. A
// vaccine 20 days away is "Coming up" (it shows from 30 days before it is due).
test('the demo Home ranks four pets of mixed urgency and shows the one photo', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(rows(page)).toHaveCount(4);
  const row = (name: string) => rows(page).filter({ hasText: name });
  await expect(row('Momo')).toContainText('Overdue');
  await expect(rows(page).first()).toContainText('Momo');
  await expect(row('Miso')).toContainText('Rabies');
  await expect(row('Miso')).toContainText('Due');
  await expect(row('Pip')).toContainText('All caught up');
  await expect(row('Momo').getByRole('img', { name: 'Photo of Momo' })).toBeVisible();
  await expect(rows(page).getByRole('img', { name: /^Photo of/ })).toHaveCount(1);
});
