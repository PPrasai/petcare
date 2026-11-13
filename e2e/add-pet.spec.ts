import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { signUp, waitSynced } from './support/app';

// QA-31 / CAP-25: the add-pet wizard. A name alone saves a pet in three interactions; the full path
// writes only the reminders that were ticked, and only in shapes that exist before contract v2.

type Change = { type: string; data: Record<string, unknown> };
const pulled = async (page: Page, type: string): Promise<Change[]> => {
  const pull = await (await page.request.get('/api/sync/pull')).json();
  return (pull.changes as Change[]).filter((c) => c.type === type);
};

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('a name alone saves a pet in three interactions and sets up nothing else', async ({
  page,
}) => {
  await signUp(page, 'wiz-min');
  let interactions = 0;
  await page.getByRole('link', { name: 'Add a pet' }).click();
  interactions++;
  await page.getByLabel('Name', { exact: true }).fill('Momo');
  interactions++;
  await page.getByRole('button', { name: 'Save pet' }).click();
  interactions++;
  await expect(page.getByRole('heading', { level: 1, name: 'Momo' })).toBeVisible();
  await expect(page.locator('.toast').filter({ hasText: 'Momo joined the family' })).toBeVisible();
  expect(interactions).toBe(3);

  await waitSynced(page);
  const pets = await pulled(page, 'pet');
  expect(pets).toHaveLength(1);
  expect(pets[0]?.data).toMatchObject({ name: 'Momo', species: 'dog' });
  expect(await pulled(page, 'reminder')).toHaveLength(0);
});

test('the wizard has no navigation, shows its progress and keeps what was typed', async ({
  page,
}) => {
  await signUp(page, 'wiz-steps');
  await page.getByRole('link', { name: 'Add a pet' }).click();
  await expect(page).toHaveURL(/\/pets\/new/);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  const progress = page.getByRole('progressbar', { name: 'Progress' });
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await expect(page.getByText('Step 1 of 3')).toBeVisible();

  // The name is the only requirement, on every way forward.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Give your pet a name to continue')).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  await expect(progress).toHaveAttribute('aria-valuenow', '1');
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page.getByText('Give your pet a name to continue')).toBeVisible();

  await page.getByLabel('Name', { exact: true }).fill('Biralo');
  await page.getByRole('button', { name: 'Cat', exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'A few details' })).toBeVisible();
  await expect(progress).toHaveAttribute('aria-valuenow', '2');
  await page.getByLabel('Colour').fill('Grey');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reminders for Biralo' })).toBeVisible();

  // Back keeps the values; so does Back to the first step.
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Colour')).toHaveValue('Grey');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Biralo');
  await expect(page.getByRole('button', { name: 'Cat', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Cancel leaves without saving.
  await page.getByRole('button', { name: 'Cancel adding a pet' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Add a pet' })).toBeVisible();
  await expect(page.getByTestId('pet-row')).toHaveCount(0);
});

test('a link to a later step without a name goes back to the first step', async ({ page }) => {
  await signUp(page, 'wiz-link');
  await page.goto('/pets/new?step=3');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Meet your newest family member' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/step=1/);
});

test('the suggestions start unticked and only the ticked ones become reminders', async ({
  page,
}) => {
  await signUp(page, 'wiz-full');
  await page.getByRole('link', { name: 'Add a pet' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Biralo');
  await page.getByRole('button', { name: 'Cat', exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Breed (optional)').fill('Siamese');
  await page.getByRole('button', { name: 'Approximate age' }).click();
  await page.getByLabel('Age', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Continue' }).click();

  // A cat is offered flea prevention and brushing; the yearly check-up waits for contract v2.
  await expect(page.getByRole('switch')).toHaveCount(2);
  await expect(page.getByRole('switch', { name: 'Flea and tick prevention' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(page.getByRole('switch', { name: 'Brush coat' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(page.getByText('Annual check-up')).toHaveCount(0);

  await page
    .locator('.sugrow')
    .filter({ hasText: 'Brush coat' })
    .getByRole('button', { name: /Change/ })
    .click();
  await page.getByLabel('Time').fill('08:30');
  await page
    .getByRole('group', { name: 'Day of the week' })
    .getByRole('button', { name: 'Sat' })
    .click();
  await expect(page.getByText('Weekly on Sat at 08:30')).toBeVisible();
  await page.getByRole('switch', { name: 'Brush coat' }).click();
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Biralo' })).toBeVisible();

  await waitSynced(page);
  const reminders = await pulled(page, 'reminder');
  expect(reminders).toHaveLength(1);
  const [brush] = reminders;
  expect(brush?.data).toMatchObject({ title: 'Brush coat', active: true });
  expect(brush?.data.schedule).toMatchObject({
    kind: 'weekly',
    times: ['08:30'],
    daysOfWeek: [6],
  });
  // Nothing that only contract 003 allows (R-2).
  for (const key of ['category', 'audienceUserId', 'notBefore']) {
    expect(brush?.data).not.toHaveProperty(key);
  }
  expect(JSON.stringify(brush?.data.schedule)).not.toContain('yearly');
  const [pet] = await pulled(page, 'pet');
  expect(pet?.data).toMatchObject({ name: 'Biralo', species: 'cat', breed: 'Siamese' });
  expect(pet?.data.birthDateEstimated).toBe(true);
  expect(typeof pet?.data.birthDate).toBe('string');
});

test('Skip leaves out the details, and a photo chosen in the wizard becomes the pet photo', async ({
  page,
}) => {
  await signUp(page, 'wiz-skip');
  await page.getByRole('link', { name: 'Add a pet' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Momo');
  await page.getByTestId('wizard-photo-input').setInputFiles({
    name: 'momo.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(page.getByText('Looking good. Tap the camera to change it.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Colour').fill('Brindle');
  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reminders for Momo' })).toBeVisible();
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Momo' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Photo of Momo' }).first()).toBeVisible();

  await waitSynced(page);
  const [pet] = await pulled(page, 'pet');
  expect(pet?.data.colour).toBeUndefined();
  expect(pet?.data.photoFileId).toMatch(/^[0-9a-f-]{36}$/);
  expect(await pulled(page, 'reminder')).toHaveLength(0);
});
