import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addPet, signUp } from './support/app';

// QA-32 (amended): the exact copy of every empty state in the SPEC-petcare-003 §5.1 inventory is
// visible in a `.empty` element, and no list renders an empty <ul>. P1b-1 starts with the pages:
// the 404 and the public page of a link that is gone. Later slices add their lists here.

const noEmptyLists = async (page: Page) => {
  const empty = await page
    .locator('ul, ol')
    .evaluateAll(
      (lists) => lists.filter((list) => list.querySelectorAll('li').length === 0).length,
    );
  expect(empty, 'a list with no items is rendered').toBe(0);
};

test('the public page of a link that is gone says so', async ({ page }) => {
  await page.goto(`/e/${'g'.repeat(43)}`);
  await expect(page.locator('.empty').getByText('This link is no longer active.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'Pet emergency card' })).toBeVisible();
  await noEmptyLists(page);
});

test('an unknown address shows the 404 page, on its own and inside the shell', async ({ page }) => {
  await page.goto('/no-such-page');
  const empty = page.locator('.empty');
  await expect(empty.getByText('That page does not exist.')).toBeVisible();
  await expect(empty.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await noEmptyLists(page);

  // Signed in, the same page sits inside the shell and "Go to Home" leads back.
  await signUp(page, 'empty-404');
  await page.goto('/no-such-page');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.locator('main .empty').getByText('That page does not exist.')).toBeVisible();
  await page.getByRole('link', { name: 'Go to Home' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await noEmptyLists(page);
});

test('a fresh account sees the empty copy of expenses, contacts and invites', async ({ page }) => {
  await signUp(page, 'empty-people');

  await page.goto('/expenses');
  await expect(
    page
      .locator('.empty')
      .getByText(
        'No expenses yet. Add one here or with the + button and the month adds itself up.',
      ),
  ).toBeVisible();
  await noEmptyLists(page);

  // Spending in another month leaves this month empty.
  await page.getByRole('button', { name: 'Add an expense' }).click();
  await page.getByLabel('Date').fill('2020-01-15');
  await page.getByLabel('Amount').fill('5');
  await page.getByRole('button', { name: 'Add expense' }).click();
  await expect(page.locator('.empty').getByText('Nothing spent in this period.')).toBeVisible();
  await noEmptyLists(page);

  await page.goto('/contacts');
  await expect(
    page
      .locator('.empty')
      .getByText(
        'No contacts yet. Add your vet first, then pick them in vet visits and vaccinations.',
      ),
  ).toBeVisible();
  await noEmptyLists(page);

  await page.goto('/household');
  await expect(page.locator('.empty').getByText('No open invites.')).toBeVisible();
  await noEmptyLists(page);
});

// P3: a new account's Home invites the first pet, and a pet made through the wizard starts with the
// empty copy of every section, each with its way to fill it.
test('a new account sees the first-run invitation, and the wizard is the way in', async ({
  page,
}) => {
  await signUp(page, 'empty-first-run');
  const empty = page.locator('main .empty');
  await expect(
    empty.getByText(
      'Add your first pet and this page will show what needs doing today, most urgent first.',
    ),
  ).toBeVisible();
  await expect(empty.getByRole('heading', { level: 2, name: 'Welcome to PetCare' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await noEmptyLists(page);

  await empty.getByRole('link', { name: 'Add a pet' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Meet your newest family member' }),
  ).toBeVisible();
  await noEmptyLists(page);

  await page.getByLabel('Name', { exact: true }).fill('Momo');
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Momo' })).toBeVisible();
  // With a pet the invitation is gone and the list holds the "Add a pet" row.
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await expect(page.locator('main .empty').getByText(/^Add your first pet/)).toHaveCount(0);
  await expect(page.getByTestId('pet-row')).toHaveCount(1);
});

test('a pet made through the wizard shows the empty copy of Health and Files', async ({ page }) => {
  await signUp(page, 'empty-new-pet');
  await page.getByRole('link', { name: 'Add a pet' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Momo');
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Momo' })).toBeVisible();

  await page.getByRole('tab', { name: 'Health' }).click();
  await expect(
    page
      .locator('.empty')
      .getByText('No vaccines yet. Add the dates and we will remind you before each one is due.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add a vaccination' })).toBeVisible();
  await noEmptyLists(page);

  await page.getByRole('tab', { name: 'Files' }).click();
  await expect(
    page
      .locator('.empty')
      .getByText('No files yet. Vet records, certificates and photos for Momo live here.'),
  ).toBeVisible();
  await noEmptyLists(page);
});

// P4: a new pet's Care tab says what Today, Reminders and Feeding are for, and offers the action.
test('the Care tab of a new pet shows the empty copy of Today, Reminders and Feeding', async ({
  page,
}) => {
  await signUp(page, 'empty-care');
  await addPet(page, 'Momo');
  await page.getByRole('tab', { name: 'Care' }).click();
  await expect(page.locator('.empty').getByText('Nothing due today.')).toBeVisible();
  await expect(
    page
      .locator('.empty')
      .getByText('No reminders yet. Add one for walks, medication, grooming or anything else.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add a reminder for Momo' })).toBeVisible();
  await noEmptyLists(page);

  await page.locator('summary').filter({ hasText: 'Feeding' }).click();
  await expect(
    page.locator('.empty').getByText('No presets yet. Log a meal and it is remembered here.'),
  ).toBeVisible();
  await noEmptyLists(page);
});
