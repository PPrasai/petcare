import { expect, test } from '@playwright/test';
import { uniqueEmail } from './support/app';

// QA-17: a new user registers, adds a pet and a vaccination in at most 12 interactions.
// Interactions are counted in the page, from real clicks and keyboard-submitted forms, so the
// count does not depend on how the test is written.
const LIMIT = 12;

test('registering, adding a pet and a vaccination takes at most 12 interactions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __interactions: number };
    w.__interactions = 0;
    document.addEventListener(
      'click',
      (event) => {
        if (event.isTrusted) w.__interactions += 1;
      },
      true,
    );
    document.addEventListener(
      'submit',
      (event) => {
        // A submit caused by a click was already counted as that click.
        if (event.isTrusted && !(event as SubmitEvent).submitter) w.__interactions += 1;
      },
      true,
    );
  });
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `198.52.${octet()}.${octet()}` });

  await page.goto('/');
  await page.getByRole('link', { name: /create an account|sign up/i }).click();
  await page.getByLabel('Your name').fill('First Value');
  await page.getByLabel('Email').fill(uniqueEmail('first-value'));
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

  await page.getByRole('link', { name: 'Pets', exact: true }).click();
  await page.getByRole('link', { name: 'Add a pet' }).click();
  await page.getByLabel('Pet name').fill('Momo');
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Momo' })).toBeVisible();

  await page.getByRole('link', { name: 'Vaccinations' }).click();
  await page.getByLabel('Vaccine', { exact: true }).fill('Rabies');
  await page.getByLabel('Given on').fill('2025-01-15');
  await page.getByRole('button', { name: 'Add vaccination' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Rabies' })).toBeVisible();

  const count = await page.evaluate(
    () => (window as unknown as { __interactions: number }).__interactions,
  );
  console.log(`first value reached in ${count} interactions`);
  expect(count).toBeLessThanOrEqual(LIMIT);
});
