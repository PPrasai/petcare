import { expect, test } from '@playwright/test';
import { addPet, openDetails, signUp, waitSynced } from './support/app';

// CAP-04: pet profiles, edit, archive and restore, including offline.
test('add, edit, archive and restore a pet; data survives a reload and reaches the server', async ({
  page,
}) => {
  await signUp(page, 'pets');
  await page.getByRole('link', { name: 'Add a pet' }).click();
  await page.getByLabel('Pet name').fill('Momo');
  await page.getByLabel('Species').selectOption('dog');
  await page.getByLabel('Breed', { exact: true }).fill('Terrier');
  await page.getByLabel('Mixed breed').check();
  await page.getByLabel('Sex').selectOption('female');
  await page.getByLabel('Neutered or spayed').selectOption('yes');
  await page.getByLabel('Date of birth', { exact: true }).fill('2020-03-04');
  await page.getByLabel('Date of birth is an estimate').check();
  await page.getByLabel('Microchip number').fill('985112003456789');
  await page.getByLabel('Insurance provider').fill('PetSure');
  await page.getByRole('button', { name: 'Save pet' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Momo' })).toBeVisible();
  await openDetails(page);
  await expect(page.getByText('Terrier · Mixed breed')).toBeVisible();
  await expect(page.getByText('2020-03-04 (estimated)')).toBeVisible();
  await expect(page.getByText('985112003456789')).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Colour').fill('Brindle');
  await page.getByLabel('Insurance provider').fill('');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Brindle')).toBeVisible();
  await expect(page.getByText('PetSure')).toHaveCount(0);

  await waitSynced(page);
  const pull = await (await page.request.get('/api/sync/pull')).json();
  const pet = pull.changes.find((c: { type: string }) => c.type === 'pet');
  expect(pet.data).toMatchObject({
    name: 'Momo',
    breed: 'Terrier',
    colour: 'Brindle',
    neutered: true,
  });
  expect(pet.data.insurance).toBeUndefined();

  await page.getByRole('button', { name: 'Archive pet' }).click();
  await page.getByLabel('Reason').selectOption('rehomed');
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByText('This pet is archived')).toBeVisible();
  await page.reload();
  await openDetails(page);
  await expect(page.getByText('This pet is archived')).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await page.locator('summary').filter({ hasText: 'Archived pets' }).click();
  await page.getByRole('link', { name: 'Momo' }).click();
  await openDetails(page);
  await page.getByRole('button', { name: 'Restore pet' }).click();
  await expect(page.getByText('This pet is archived')).toHaveCount(0);
});

test('a pet created offline appears at once and syncs when back online', async ({
  page,
  context,
}) => {
  await signUp(page, 'petsoff');
  await context.setOffline(true);
  await addPet(page, 'Biralo');
  await expect(page.getByTestId('pending-count')).toHaveAttribute('data-count', '1');
  await context.setOffline(false);
  await waitSynced(page);
  const pull = await (await page.request.get('/api/sync/pull')).json();
  expect(pull.changes.map((c: { data: { name?: string } }) => c.data.name)).toContain('Biralo');
});
