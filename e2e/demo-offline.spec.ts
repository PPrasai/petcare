import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// CAP-03: the demo is complete on the device alone. /api is unreachable for the whole test (the
// preview has no server behind it either), and the page must log no console error.
async function openDemo(page: Page) {
  // The sign-in page asks the server for its options before the demo is chosen; from there on
  // nothing may go out and nothing may log an error.
  await page.route('**/api/**', (route) => route.abort('connectionrefused'));
  await page.goto('/sign-in');
  await page.getByRole('button', { name: 'Try the demo' }).click();
  await expect(page.getByRole('region', { name: 'Demo mode' })).toBeVisible();
  const errors: string[] = [];
  const apiCalls: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) apiCalls.push(r.url());
  });
  return { errors, apiCalls };
}

const openPet = async (page: Page, name: string) => {
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await page.getByTestId('pet-row').filter({ hasText: name }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
};

for (const [label, viewport] of [
  ['phone', { width: 390, height: 844 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test(`demo ${label}: add a pet with a reminder time, log a weight for it, and see both after a reload`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const { errors, apiCalls } = await openDemo(page);

    await page.getByRole('link', { name: 'Add a pet' }).first().click();
    await page.getByLabel('Name', { exact: true }).fill('Pixel');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    const row = page.locator('.sugrow').filter({ hasText: 'Annual check-up' });
    await row.getByRole('button', { name: /Change/ }).click();
    const time = page.getByLabel('Time', { exact: true });
    await expect(time).toHaveAttribute('type', 'time');
    await time.fill('07:45');
    await expect(page.getByText(/at 07:45/)).toBeVisible();
    await page.getByRole('switch', { name: 'Annual check-up' }).click();
    await page.getByRole('button', { name: 'Save pet' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Pixel' })).toBeVisible();

    // Log opens for the pet whose page is open, not for the first pet in the household.
    await page.getByTestId('log-open').filter({ visible: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Log something' });
    await expect(sheet.getByRole('button', { name: 'Pixel' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await sheet.getByRole('button', { name: 'Weight', exact: true }).first().click();
    await sheet.getByRole('button', { name: /^Raise/ }).click();
    await sheet.getByRole('button', { name: /^Save weight/ }).click();
    await expect(page.locator('.toast').filter({ hasText: 'Pixel' })).toContainText('weight');

    await page.reload();
    await openPet(page, 'Pixel');
    await page.getByRole('tab', { name: 'Health', exact: true }).click();
    await expect(page.getByText('No measurements yet.')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Care', exact: true }).click();
    await expect(page.getByText(/07:45/).first()).toBeVisible();

    expect({ errors, apiCalls }).toEqual({ errors: [], apiCalls: [] });
    expect(apiCalls).toEqual([]);
  });
}

test('demo: reminders, vaccines, medications, expenses, contacts and preferences all save and persist', async ({
  page,
}) => {
  const { errors, apiCalls } = await openDemo(page);

  // A reminder with a chosen time.
  await openPet(page, 'Pip');
  await page.getByRole('tab', { name: 'Care', exact: true }).click();
  await page.getByRole('button', { name: 'Add a reminder for Pip' }).click();
  await page.getByLabel('Reminder name').fill('Teeth brushing');
  await page.getByLabel('Time', { exact: true }).fill('18:20');
  await page.getByRole('button', { name: 'Save reminder' }).click();
  await expect(page.getByText('Teeth brushing').first()).toBeVisible();

  // A vaccine and a medication with two chosen times.
  await page.getByRole('tab', { name: 'Health', exact: true }).click();
  await page.getByRole('button', { name: 'Add a vaccination' }).click();
  await page.getByLabel('Given on').fill('2026-03-01');
  await page.getByLabel('Vaccine', { exact: true }).fill('Rabies');
  await page.getByRole('button', { name: 'Add vaccination' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Rabies' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Add a medication' }).click();
  await page.getByLabel('Medication', { exact: true }).fill('Probiotic');
  await page.getByLabel('Dose', { exact: true }).fill('1');
  await page.getByLabel('Dose unit').selectOption('mg');
  await expect(page.getByLabel('Time', { exact: true })).toHaveAttribute('type', 'time');
  await page.getByLabel('Time', { exact: true }).fill('08:00');
  await page.getByRole('button', { name: 'Add another time' }).click();
  await page.getByLabel('Time 2', { exact: true }).fill('20:00');
  await page.getByRole('button', { name: 'Add medication' }).click();
  await expect(page.getByText('Probiotic').first()).toBeVisible();

  // An expense and a contact.
  await page.getByRole('link', { name: 'Expenses', exact: true }).first().click();
  await page.getByRole('button', { name: 'Add expense' }).click();
  await page.getByLabel('Amount').fill('12.50');
  await page
    .getByRole('dialog', { name: 'Add expense' })
    .getByRole('button', { name: 'Add expense' })
    .click();
  await expect(page.locator('.toast').filter({ hasText: 'Added' })).toBeVisible();
  await page.goto('/contacts');
  await page.getByRole('button', { name: 'Add contact' }).click();
  await page.getByLabel('Name', { exact: true }).fill('Dr. Demo');
  await page
    .getByRole('dialog', { name: 'Add contact' })
    .getByRole('button', { name: 'Add contact' })
    .click();
  await expect(page.getByText('Dr. Demo', { exact: true })).toBeVisible();

  // Preferences save in the demo database.
  await page.goto('/settings');
  await page.getByLabel('Weight unit').selectOption('lb');
  await page.getByRole('button', { name: 'Save preferences' }).click();
  await expect(page.getByText('Preferences saved.')).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Weight unit')).toHaveValue('lb');
  await page.goto('/contacts');
  await expect(page.getByText('Dr. Demo', { exact: true })).toBeVisible();
  await openPet(page, 'Pip');
  await page.getByRole('tab', { name: 'Health', exact: true }).click();
  await expect(page.getByText('Probiotic').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Care', exact: true }).click();
  await expect(page.getByText('Teeth brushing').first()).toBeVisible();

  expect({ errors, apiCalls }).toEqual({ errors: [], apiCalls: [] });
  expect(apiCalls).toEqual([]);
});
