import { expect, test } from '@playwright/test';
import { addPet, signUp, waitSynced } from './support/app';

type Change = { type: string; data: Record<string, unknown> };
const pulled = async (page: import('@playwright/test').Page, type: string): Promise<Change[]> => {
  const pull = await (await page.request.get('/api/sync/pull')).json();
  return pull.changes.filter((c: Change) => c.type === type);
};

// CAP-06: vaccinations with species suggestions and overdue / due-soon badges.
test('vaccinations: suggestions fill name and interval, overdue shows at a glance', async ({
  page,
}) => {
  await signUp(page, 'vacc');
  await addPet(page, 'Momo');
  await page.getByRole('link', { name: 'Vaccinations' }).click();

  await expect(page.getByText('Suggestions — confirm intervals with your vet')).toBeVisible();
  await page.getByLabel('Given on').fill('2024-03-01');
  await page.getByRole('button', { name: 'Rabies' }).click();
  await expect(page.getByLabel('Vaccine', { exact: true })).toHaveValue('Rabies');
  await expect(page.getByLabel('Next due on')).toHaveValue('2025-03-01'); // given + 365 days
  await page.getByLabel('Batch number').fill('B-42');
  await page.getByRole('button', { name: 'Add vaccination' }).click();

  const item = page.getByRole('listitem').filter({ hasText: 'Rabies' });
  await expect(item.getByText('Overdue')).toBeVisible();
  await expect(item.getByText('Batch B-42')).toBeVisible();

  // A newer dose of the same vaccine answers the overdue one.
  const today = new Date().toISOString().slice(0, 10);
  await page.getByLabel('Vaccine', { exact: true }).fill('rabies');
  await page.getByLabel('Given on').fill(today);
  await page.getByLabel('Next due on').fill('2099-01-01');
  await page.getByRole('button', { name: 'Add vaccination' }).click();
  await expect(page.getByText('Overdue')).toHaveCount(0);
  await expect(page.getByText('Up to date')).toBeVisible();

  await waitSynced(page);
  const vaccinations = await pulled(page, 'vaccination');
  expect(vaccinations.map((v) => v.data.batchNumber)).toContain('B-42');
});

// CAP-09: medication schedule with dose logging.
test('medications: a scheduled dose can be given or skipped and syncs', async ({ page }) => {
  await signUp(page, 'meds');
  await addPet(page, 'Momo');
  await page.getByRole('link', { name: 'Medications' }).click();

  await page.getByLabel('Medication', { exact: true }).fill('Amoxicillin');
  await page.getByLabel('Dose', { exact: true }).fill('5');
  await page.getByLabel('Dose unit').selectOption('mg');
  await page.getByLabel('Times (24-hour, comma separated)').fill('09:00');
  await page.getByRole('button', { name: 'Add medication' }).click();

  const doses = page.getByRole('list', { name: 'Doses of Amoxicillin' });
  await expect(doses.getByRole('listitem').first()).toBeVisible();
  await page
    .getByRole('button', { name: /Mark Amoxicillin at .* as given/ })
    .first()
    .click();
  await expect(doses.getByText('Given', { exact: true })).toBeVisible();

  await waitSynced(page);
  const logged = await pulled(page, 'medicationDose');
  expect(logged).toHaveLength(1);
  expect(logged[0]?.data).toMatchObject({ skipped: false });
});

// CAP-09: visits, conditions and the symptoms journal.
test('visits, conditions and symptoms are recorded and shown', async ({ page }) => {
  await signUp(page, 'visits');
  await addPet(page, 'Momo');

  await page.getByRole('link', { name: 'Vet visits' }).click();
  await page.getByLabel('Visit date').fill('2026-02-10');
  await page.getByLabel('Reason').fill('Annual check');
  await page.getByLabel('Diagnosis').fill('Healthy');
  await page.getByLabel('Cost').fill('45.50');
  await page.getByLabel('Follow-up on').fill('2099-02-10');
  await page.getByRole('button', { name: 'Add visit' }).click();
  await expect(page.getByText('Annual check')).toBeVisible();
  await expect(page.getByText('Diagnosis: Healthy')).toBeVisible();
  await expect(page.getByText('$45.50')).toBeVisible();

  await page.getByRole('link', { name: 'Conditions' }).click();
  await page.getByLabel('Condition name').fill('Chicken');
  await page.getByLabel('Severity', { exact: true }).selectOption('moderate');
  await page.getByRole('button', { name: 'Add condition' }).click();
  const condition = page.getByRole('listitem').filter({ hasText: 'Chicken' });
  await expect(condition.getByText('Allergy · Moderate')).toBeVisible();
  await page.getByRole('button', { name: 'Mark Chicken resolved' }).click();
  await expect(condition.getByText(/Resolved/)).toBeVisible();

  await page.getByLabel('What you noticed').fill('Scratching the left ear');
  await page.getByRole('button', { name: 'Add symptom' }).click();
  await expect(page.getByText('Scratching the left ear')).toBeVisible();

  await waitSynced(page);
  expect(await pulled(page, 'vetVisit')).toHaveLength(1);
  const [cond] = await pulled(page, 'condition');
  expect(cond?.data.resolvedOn).toBeTruthy();
  expect(await pulled(page, 'symptomEntry')).toHaveLength(1);
});

test('health records can be added offline and sync later', async ({ page, context }) => {
  await signUp(page, 'healthoff');
  await addPet(page, 'Momo');
  await waitSynced(page);
  await page.getByRole('link', { name: 'Conditions' }).click();
  await context.setOffline(true);
  await page.getByLabel('Condition name').fill('Asthma');
  await page.getByRole('button', { name: 'Add condition' }).click();
  await expect(page.getByText('Asthma')).toBeVisible();
  await expect(page.getByTestId('pending-count')).toHaveAttribute('data-count', '1');
  await context.setOffline(false);
  await waitSynced(page);
  expect((await pulled(page, 'condition')).map((c) => c.data.name)).toContain('Asthma');
});
