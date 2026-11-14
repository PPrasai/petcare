import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addPet, createInvite, signUp, uniqueEmail, userId, waitSynced } from './support/app';

const UNUSABLE = "This photo can't be used. Try a JPEG or PNG.";
const octet = () => Math.floor(Math.random() * 250) + 1;

/** A JPEG APP1 segment that carries an Exif block with a GPS position (latitude/longitude). */
function exifWithGps(): Buffer {
  const rational = (n: number) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(n, 0);
    b.writeUInt32LE(1, 4);
    return b;
  };
  const long = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n, 0);
    return b;
  };
  const entry = (tag: number, type: number, count: number, value: Buffer) => {
    const b = Buffer.alloc(12);
    b.writeUInt16LE(tag, 0);
    b.writeUInt16LE(type, 2);
    b.writeUInt32LE(count, 4);
    value.copy(b, 8);
    return b;
  };
  // TIFF: header (8), IFD0 with one entry (the GPS IFD pointer), then the GPS IFD with 4 entries.
  const ifd0At = 8;
  const gpsAt = ifd0At + 2 + 12 + 4;
  const dataAt = gpsAt + 2 + 4 * 12 + 4;
  const header = Buffer.concat([Buffer.from('II'), Buffer.from([0x2a, 0]), long(ifd0At)]);
  const ifd0 = Buffer.concat([Buffer.from([1, 0]), entry(0x8825, 4, 1, long(gpsAt)), long(0)]);
  const triple = Buffer.concat([rational(27), rational(42), rational(30)]);
  const gps = Buffer.concat([
    Buffer.from([4, 0]),
    entry(1, 2, 2, Buffer.from('N\0')),
    entry(2, 5, 3, long(dataAt)),
    entry(3, 2, 2, Buffer.from('E\0')),
    entry(4, 5, 3, long(dataAt + 24)),
    long(0),
  ]);
  const tiff = Buffer.concat([header, ifd0, gps, triple, triple]);
  const body = Buffer.concat([Buffer.from('Exif\0\0'), tiff]);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(body.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xe1]), length, body]);
}

/** A 4000 x 3000 busy JPEG, drawn by the browser, with GPS Exif added after the SOI marker. */
async function bigJpegWithGps(page: Page, dir: string): Promise<string> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4000;
    canvas.height = 3000;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('no canvas');
    const gradient = g.createLinearGradient(0, 0, 4000, 3000);
    gradient.addColorStop(0, '#c98f55');
    gradient.addColorStop(1, '#3a58a8');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 4000, 3000);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = `hsl(${(i * 37) % 360} 60% ${30 + ((i * 13) % 40)}%)`;
      g.fillRect((i * 97) % 3900, (i * 211) % 2900, 40 + (i % 90), 30 + (i % 60));
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.92),
    );
    if (!blob) throw new Error('no jpeg');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  });
  const jpeg = Buffer.from(base64, 'base64');
  const withExif = Buffer.concat([jpeg.subarray(0, 2), exifWithGps(), jpeg.subarray(2)]);
  expect(withExif.includes(Buffer.from('Exif'))).toBe(true);
  const path = join(dir, 'IMG_4000x3000.jpg');
  writeFileSync(path, withExif);
  return path;
}

/** The first upload waiting on this device, as the page sees it: size, long edge, Exif or not. */
async function pendingPhoto(page: Page, user: string) {
  return page.evaluate(async (id) => {
    const open = indexedDB.open(`petcare-u-${id}`);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const rows = await new Promise<{ blob: Blob }[]>((resolve) => {
      const request = db.transaction('pendingFiles').objectStore('pendingFiles').getAll();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    const row = rows[0];
    if (!row) return null;
    const bytes = new Uint8Array(await row.blob.arrayBuffer());
    let text = '';
    for (const byte of bytes) text += String.fromCharCode(byte);
    const bitmap = await createImageBitmap(row.blob);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return {
      count: rows.length,
      size: row.blob.size,
      mimeType: row.blob.type,
      ...dims,
      hasExif: text.includes('Exif'),
    };
  }, user);
}

// QA-35 / CAP-22: the real CanvasImageReducer runs in the page. A big GPS-tagged photo chosen
// offline shows at once as a small JPEG with no metadata, and uploads on reconnect.
test('a big photo is reduced, shown offline, stripped of its location and uploaded later', async ({
  page,
  context,
}) => {
  const dir = mkdtempSync(join(tmpdir(), 'petcare-photo-'));
  try {
    await signUp(page, 'photo');
    await addPet(page, 'Momo');
    await waitSynced(page);
    const user = await userId(page);
    const source = await bigJpegWithGps(page, dir);

    await context.setOffline(true);
    await page.getByTestId('pet-photo-input').setInputFiles(source);
    await expect(page.getByRole('img', { name: 'Photo of Momo' }).first()).toBeVisible();
    await expect(page.locator('.toast').filter({ hasText: 'New photo for Momo' })).toBeVisible();

    const stored = await pendingPhoto(page, user);
    expect(stored).not.toBeNull();
    expect(stored?.count).toBe(1);
    expect(stored?.mimeType).toBe('image/jpeg');
    expect(stored?.size).toBeLessThanOrEqual(200 * 1024);
    const longEdge = Math.max(stored?.width ?? 0, stored?.height ?? 0);
    expect(longEdge).toBeLessThanOrEqual(768);
    expect(longEdge).toBeGreaterThan(700);
    expect(stored?.hasExif).toBe(false);

    await context.setOffline(false);
    await waitSynced(page);
    const pull = await (await page.request.get('/api/sync/pull')).json();
    const pet = pull.changes.find((c: { type: string }) => c.type === 'pet');
    const fileId = pet.data.photoFileId as string;
    expect(fileId).toMatch(/^[0-9a-f-]{36}$/);
    const file = await page.request.get(`/api/files/${fileId}`);
    expect(file.ok()).toBe(true);
    expect((await file.body()).length).toBeLessThanOrEqual(200 * 1024);
    await expect(page.getByRole('img', { name: 'Photo of Momo' }).first()).toBeVisible();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the photo can be replaced and removed, and a file that is not an image is refused', async ({
  page,
}) => {
  await signUp(page, 'photo2');
  await addPet(page, 'Momo');
  const input = page.getByTestId('pet-photo-input');
  const picture = page.getByRole('img', { name: 'Photo of Momo' });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  // Not an image: refused, and the illustration stays.
  await input.setInputFiles({
    name: 'notes.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('hi'),
  });
  await expect(page.locator('.toast').filter({ hasText: UNUSABLE })).toBeVisible();
  await expect(picture).toHaveCount(0);

  // Add, then replace, through the camera badge.
  await input.setInputFiles({ name: 'one.png', mimeType: 'image/png', buffer: png });
  await expect(picture.first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add a photo' })).toHaveCount(0);
  const first = await picture.first().getAttribute('src');
  await page.getByLabel('Change Momo’s photo').click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose a new photo' }).click();
  await (await chooser).setFiles({ name: 'two.png', mimeType: 'image/png', buffer: png });
  await expect(picture.first()).not.toHaveAttribute('src', first ?? '');
  await waitSynced(page);

  // Remove: the illustration and the "Add a photo" button return.
  await page.getByLabel('Change Momo’s photo').click();
  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(picture).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add a photo' })).toBeVisible();
  await waitSynced(page);
  const pull = await (await page.request.get('/api/sync/pull')).json();
  const pet = pull.changes.find((c: { type: string }) => c.type === 'pet');
  expect(pet.data.photoFileId ?? null).toBeNull();
});

test('a viewer sees the pet but has no camera badge', async ({ page, browser }) => {
  await signUp(page, 'photoowner');
  await addPet(page, 'Momo');
  await waitSynced(page);
  await page.getByRole('link', { name: 'Household', exact: true }).click();
  await createInvite(page, 'Viewer');
  const code = (await page.getByTestId('invite-code').textContent()) ?? '';

  const other = await browser.newContext();
  const viewer = await other.newPage();
  await viewer.context().setExtraHTTPHeaders({ 'x-forwarded-for': `198.53.${octet()}.${octet()}` });
  await viewer.goto('/sign-up');
  await viewer.getByLabel('Your name').fill('Viewer Person');
  await viewer.getByLabel('Email').fill(uniqueEmail('photoviewer'));
  await viewer.getByLabel('Password').fill('correct-horse-battery');
  await viewer.getByRole('button', { name: 'Create account' }).click();
  await expect(viewer.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await viewer.goto('/join');
  await viewer.getByLabel('Invite code').fill(code.toLowerCase());
  await viewer.getByRole('button', { name: 'Check code' }).click();
  await viewer.getByRole('button', { name: 'Join household' }).click();
  await expect(viewer.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await viewer.getByRole('link', { name: 'Home', exact: true }).first().click();
  await viewer.getByTestId('pet-row').filter({ hasText: 'Momo' }).click();
  await expect(viewer.getByRole('heading', { level: 1, name: 'Momo' })).toBeVisible();
  await expect(viewer.getByLabel('Change Momo’s photo')).toHaveCount(0);
  await expect(viewer.getByRole('button', { name: 'Add a photo' })).toHaveCount(0);
  await other.close();
});
