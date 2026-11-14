import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { signUp, waitSynced } from './support/app';

// QA-21: with a seeded local database (20 pets, 10 of them with a photo) and the CPU throttled 4x, the first pet card
// appears within 2 s, both online and offline (median of 5 runs). Production build, real API.
const PETS = 20;
const PHOTOS = 10;
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

/** Uploads one reduced-size JPEG per photo, as the app's own reducer would make (768 px edge). */
async function uploadPhotos(page: Page, householdId: string): Promise<string[]> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 576;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    const gradient = ctx.createLinearGradient(0, 0, 768, 576);
    gradient.addColorStop(0, '#c98b5a');
    gradient.addColorStop(1, '#3a58a8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 768, 576);
    return canvas.toDataURL('image/jpeg', 0.82).split(',')[1] ?? '';
  });
  const buffer = Buffer.from(base64, 'base64');
  const ids: string[] = [];
  for (let n = 0; n < PHOTOS; n++) {
    const res = await page.request.post('/api/files', {
      headers: { origin: ORIGIN },
      multipart: { householdId, file: { name: `pet-${n}.jpg`, mimeType: 'image/jpeg', buffer } },
    });
    expect(res.status()).toBe(201);
    ids.push((await res.json()).id as string);
  }
  return ids;
}

async function seedPets(page: Page): Promise<void> {
  const me = await (await page.request.get('/api/me')).json();
  const householdId = me.households[0].id as string;
  const photos = await uploadPhotos(page, householdId);
  const mutations = Array.from({ length: PETS }, (_, n) => ({
    mutationId: uuid7(),
    type: 'pet',
    id: uuid7(),
    householdId,
    op: 'create',
    baseVersion: 0,
    fields: {
      name: `Pet ${String(n + 1).padStart(2, '0')}`,
      species: n % 2 ? 'cat' : 'dog',
      ...(photos[n] ? { photoFileId: photos[n] } : {}),
    },
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
  await page.goto('/');
  await page.getByTestId('pet-row').first().waitFor({ state: 'visible' });
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
  await page.goto('/');
  await expect(page.getByTestId('pet-row')).toHaveCount(PETS, {
    timeout: 30_000,
  });
  await waitSynced(page);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);

  // QA-36: the font swap must not shift the layout (cumulative layout shift of the Home list).
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
        if (!e.hadRecentInput) w.__cls += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const online: number[] = [];
  for (let run = 0; run < RUNS; run++) online.push(await timeToFirstPet(page));

  await context.setOffline(true);
  const offline: number[] = [];
  for (let run = 0; run < RUNS; run++) offline.push(await timeToFirstPet(page));

  await page.goto('/');
  await page.getByTestId('pet-row').first().waitFor({ state: 'visible' });
  await page.waitForTimeout(500);
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  console.log(`layout shift on the Home list: ${cls}`);
  expect(cls).toBeLessThanOrEqual(0.1);

  console.log(
    `time to first pet card (ms) online ${online.join(', ')}; offline ${offline.join(', ')}`,
  );
  expect(median(online), `online runs: ${online.join(', ')}`).toBeLessThanOrEqual(LIMIT_MS);
  expect(median(offline), `offline runs: ${offline.join(', ')}`).toBeLessThanOrEqual(LIMIT_MS);
});
