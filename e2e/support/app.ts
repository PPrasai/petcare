import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

let counter = 0;
export const uniqueEmail = (label: string) => `${label}-${Date.now()}-${counter++}@example.test`;

/** Creates an account through the sign-up page and waits for the signed-in shell. */
export async function signUp(page: Page, label = 'e2e') {
  const email = uniqueEmail(label);
  // Sign-up is limited to 5 a minute per client IP; each test pretends to be its own client.
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.${octet()}.${octet()}` });
  await page.goto('/sign-up');
  await page.getByLabel('Your name').fill(`${label} Person`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  return email;
}

export async function addPet(page: Page, name: string) {
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await page.getByRole('link', { name: 'Add a pet' }).click();
  await page.getByLabel('Pet name').fill(name);
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** Waits until nothing is waiting to sync. */
export async function waitSynced(page: Page) {
  await expect(page.getByTestId('pending-count')).toHaveAttribute('data-count', '0', {
    timeout: 15_000,
  });
}

export async function userId(page: Page): Promise<string> {
  const res = await page.request.get('/api/me');
  return (await res.json()).user.id as string;
}

/** Opens a disclosure by its title (for example "Vet visits" on the Health tab). */
export async function openDisclosure(page: Page, title: string) {
  await page.locator('summary').filter({ hasText: title }).click();
}

/** Opens the "Details" disclosure on a pet's Overview tab. */
export async function openDetails(page: Page) {
  await openDisclosure(page, 'Details');
}

/**
 * Makes an account with a pet whose emergency card is shared, and returns the public path a
 * finder would open. With `lost` the pet is marked as lost with a message.
 */
export async function shareEmergencyCard(
  browser: Browser,
  options: { lost?: boolean } = {},
): Promise<string> {
  const context = await browser.newContext({ baseURL: 'http://localhost:4173' });
  try {
    const page = await context.newPage();
    await signUp(page, 'public-card');
    await addPet(page, 'Momo');
    await page.getByRole('link', { name: 'Emergency card' }).click();
    await page.getByRole('button', { name: 'Set up card' }).click();
    await page.getByLabel('My name', { exact: true }).check();
    await page.getByLabel('Name to show').fill('Sam Owner');
    await page.getByLabel('My phone number', { exact: true }).check();
    await page.getByLabel('Phone number to show').fill('+1 555 0100');
    await page.getByLabel('Notes', { exact: true }).check();
    await page.getByLabel('Notes for a finder').fill('Shy, will hide');
    await page.getByRole('button', { name: 'Save card' }).click();
    await expect(page.locator('.toast').filter({ hasText: 'Saved.' })).toBeVisible();
    await waitSynced(page);
    await page.getByRole('button', { name: 'Create link' }).click();
    const link = (await page.getByTestId('emergency-link').textContent()) ?? '';
    if (options.lost) {
      await page.getByRole('button', { name: 'Mark Momo as lost' }).click();
      await page.getByLabel('Message for a finder').fill('Please call me');
      await page.getByRole('button', { name: 'Mark as lost', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Turn off lost mode' })).toBeVisible();
      await waitSynced(page);
    }
    return new URL(link).pathname;
  } finally {
    await context.close();
  }
}

/** On /household as the owner: opens the Invite sheet, picks the role and creates the invite. */
export async function createInvite(page: Page, role: 'Viewer' | 'Caretaker' = 'Caretaker') {
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  await page.getByRole('group', { name: 'Invite as' }).getByRole('button', { name: role }).click();
  await page.getByRole('button', { name: 'Create invite' }).click();
}
