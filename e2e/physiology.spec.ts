import { expect, test } from '@playwright/test';
import { addPet, signUp, waitSynced } from './support/app';

// CAP-05: measurements, weight chart with a table alternative, units by preference.
test('weight is shown in the preferred unit with a chart and a table', async ({
  page,
  context,
}) => {
  await signUp(page, 'physio');
  await addPet(page, 'Momo');
  await page.getByRole('tab', { name: 'Health' }).click();

  await page.getByLabel('Value (kg)').fill('10');
  await page.getByLabel('Measured on').fill('2026-01-10T09:00');
  await page.getByRole('button', { name: 'Add measurement' }).click();
  await expect(page.getByLabel('Value (kg)')).toHaveValue('');
  await page.getByLabel('Value (kg)').fill('10.5');
  await page.getByLabel('Measured on').fill('2026-02-10T09:00');
  await page.getByRole('button', { name: 'Add measurement' }).click();

  const table = page.getByRole('table', { name: 'All measurements' });
  await expect(table.getByRole('row')).toHaveCount(3); // header + 2
  await expect(table.getByText('10.5 kg')).toBeVisible();
  await expect(
    page.getByRole('img', { name: /Weight chart from .* 2 measurements/ }),
  ).toBeVisible();
  await expect(page.locator('.recharts-line')).toBeVisible();

  await page.getByLabel('Measurement', { exact: true }).selectOption('bodyCondition');
  await page.getByLabel('Value (/9)').fill('5');
  await page.getByRole('button', { name: 'Add measurement' }).click();
  await expect(table.getByText('5 /9')).toBeVisible();

  // Invalid input is refused with a message.
  await page.getByLabel('Measurement', { exact: true }).selectOption('bodyCondition');
  await page.getByLabel('Value (/9)').fill('0');
  await page.getByRole('button', { name: 'Add measurement' }).click();
  await expect(page.getByText('Enter a number greater than zero.')).toBeVisible();

  // Units follow the preference (stored values stay in kg).
  await waitSynced(page);
  const put = await page.request.put('/api/me/preferences', {
    headers: { origin: 'http://localhost:4173' },
    data: {
      weightUnit: 'lb',
      lengthUnit: 'in',
      temperatureUnit: 'f',
      timeZone: 'UTC',
      dateFormat: 'dmy',
      currency: 'USD',
      theme: 'system',
      leadMinutes: {
        vaccination: 10080,
        medication: 0,
        careRoutine: 0,
        reminder: 0,
        vetVisit: 1440,
      },
      pushEnabled: true,
      pushTypes: ['vaccination', 'medication', 'careRoutine', 'reminder', 'vetVisit'],
    },
  });
  expect([put.status(), await put.text()]).toEqual([200, expect.anything()]);
  await page.reload();
  await page.getByRole('tab', { name: 'Health' }).click();
  await expect(
    page.getByRole('table', { name: 'All measurements' }).getByText('23.15 lb'),
  ).toBeVisible();
  await expect(page.getByText('10/02/2026')).toBeVisible();

  // Works offline and syncs afterwards.
  await context.setOffline(true);
  await page.getByLabel('Measurement', { exact: true }).selectOption('weight');
  await page.getByLabel('Value (lb)').fill('24');
  await page.getByRole('button', { name: 'Add measurement' }).click();
  await expect(page.getByTestId('pending-count')).toHaveAttribute('data-count', '1');
  await context.setOffline(false);
  await waitSynced(page);
  const pull = await (await page.request.get('/api/sync/pull')).json();
  const weights = pull.changes
    .filter(
      (c: { type: string; data: { kind: string } }) =>
        c.type === 'measurement' && c.data.kind === 'weight',
    )
    .map((c: { data: { value: number } }) => c.data.value);
  expect(weights.some((v: number) => Math.abs(v - 24 / 2.20462262) < 0.001)).toBe(true);
});
