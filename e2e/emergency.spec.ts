import { expect, test } from '@playwright/test';
import { addPet, signUp, waitSynced } from './support/app';

// CAP-14: the emergency card, its QR link and the public page a finder sees.
test('an owner shares an emergency card, marks the pet lost, and revokes the link', async ({
  page,
  browser,
}) => {
  await signUp(page, 'finder');
  await addPet(page, 'Momo');
  await page.getByRole('link', { name: 'Emergency card' }).click();

  // Name and species are shown by default; the owner adds a phone number and a note in the sheet.
  await page.getByRole('button', { name: 'Set up card' }).click();
  await page.getByLabel('My phone number', { exact: true }).check();
  await page.getByLabel('Phone number to show').fill('+1 555 0100');
  await page.getByLabel('Notes', { exact: true }).check();
  await page.getByLabel('Notes for a finder').fill('Shy, will hide');
  await page.getByRole('button', { name: 'Save card' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await waitSynced(page);

  await page.getByRole('button', { name: 'Create link' }).click();
  const link = (await page.getByTestId('emergency-link').textContent()) ?? '';
  expect(link).toMatch(/\/e\/[A-Za-z0-9_-]{43}$/);
  await expect(
    page.getByRole('img', { name: 'QR code of the emergency link' }).locator('svg'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print card' })).toBeVisible();

  // A finder opens the page with no account.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const path = new URL(link).pathname;
  await guest.goto(path);
  await expect(guest.getByRole('heading', { level: 1, name: 'Momo' })).toBeVisible();
  await expect(guest.getByText('Shy, will hide')).toBeVisible();
  await expect(guest.getByRole('link', { name: 'Call +1 555 0100' })).toHaveAttribute(
    'href',
    'tel:+15550100',
  );
  await expect(guest.getByText('This pet is lost')).toHaveCount(0);
  await expect(guest.getByText('Microchip')).toHaveCount(0);

  // Lost mode shows up prominently on the public page.
  await page.getByRole('button', { name: 'Mark Momo as lost' }).click();
  await page.getByLabel('Message for a finder').fill('Please call me');
  await page.getByRole('button', { name: 'Mark as lost', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Turn off lost mode' })).toBeVisible();
  await waitSynced(page);
  await guest.reload();
  await expect(guest.getByRole('alert').filter({ hasText: 'This pet is lost' })).toBeVisible();
  await expect(guest.getByText('Please call me')).toBeVisible();

  await page.getByRole('button', { name: 'Turn off lost mode' }).click();
  await expect(page.getByRole('button', { name: 'Mark Momo as lost' })).toBeVisible();
  await waitSynced(page);
  await guest.reload();
  await expect(guest.getByText('This pet is lost')).toHaveCount(0);

  // Revoking the link ends public access.
  await page.getByRole('button', { name: 'Revoke link' }).click();
  await expect(page.getByText('The link no longer works.')).toBeVisible();
  await guest.reload();
  await expect(guest.getByText('This link is no longer active.')).toBeVisible();
  await guestContext.close();
});
