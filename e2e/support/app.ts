import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

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
  await page.getByRole('link', { name: 'Pets' }).click();
  await page.getByLabel('Pet name').fill(name);
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
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
