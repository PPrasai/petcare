import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { signUp, waitSynced } from './support/app';

// QA-21: with a seeded local database (20 pets) and the CPU throttled 4x, the first pet card
// appears within 2 s, both online and offline (median of 5 runs). Production build, real API.
const PETS = 20;
const RUNS = 5;
const LIMIT_MS = 2000;
const ORIGIN = 'http://localhost:4173';

/** A UUID v7 (the server validates ids as such). */
function uuid7(): string {
  const hex = Date.now().toString(16).padStart(12, '0');
  const random = crypto.getRandomValues(new Uint8Array(10));
  const r = Array.from(random, (b) => b.toString(16).padStart(2, '0')).join('');
  const variant = ((parseInt(r.slice(4, 6), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${r.slice(0, 3)}-${variant}${r.slice(6, 8)}-${r.slice(8, 20)}`;
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

async function seedPets(page: Page): Promise<void> {
  const me = await (await page.request.get('/api/me')).json();
  const householdId = me.households[0].id as string;
  const mutations = Array.from({ length: PETS }, (_, n) => ({
    mutationId: uuid7(),
    type: 'pet',
    id: uuid7(),
    householdId,
    op: 'create',
    baseVersion: 0,
    fields: { name: `Pet ${String(n + 1).padStart(2, '0')}`, species: n % 2 ? 'cat' : 'dog' },
    clientTime: new Date().toISOString(),
  }));
  const res = await page.request.post('/api/sync/push', {
    headers: { origin: ORIGIN },
    data: { clientId: uuid7(), mutations },
  });
  expect(res.status()).toBe(200);
}

async function timeToFirstPet(page: Page): Promise<number> {
  const started = Date.now();
  await page.goto('/pets');
  await page
    .getByRole('link', { name: /^Pet \d\d/ })
    .first()
    .waitFor({ state: 'visible' });
  return Date.now() - started;
}

test('the first pet card shows within 2 s on a throttled CPU, online and offline', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await signUp(page, 'cached-start');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await seedPets(page);

  // Pull the pets into this device's database, then check that they are all there.
  await page.goto('/pets');
  await expect(page.getByRole('link', { name: /^Pet \d\d/ })).toHaveCount(PETS, {
    timeout: 30_000,
  });
  await waitSynced(page);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const online: number[] = [];
  for (let run = 0; run < RUNS; run++) online.push(await timeToFirstPet(page));

  await context.setOffline(true);
  const offline: number[] = [];
  for (let run = 0; run < RUNS; run++) offline.push(await timeToFirstPet(page));

  console.log(
    `time to first pet card (ms) online ${online.join(', ')}; offline ${offline.join(', ')}`,
  );
  expect(median(online), `online runs: ${online.join(', ')}`).toBeLessThanOrEqual(LIMIT_MS);
  expect(median(offline), `offline runs: ${offline.join(', ')}`).toBeLessThanOrEqual(LIMIT_MS);
});
