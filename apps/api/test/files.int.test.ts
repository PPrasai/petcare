import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ApiClient } from './support/api-client';
import { multipartBody, pngOfSize } from './support/multipart';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { createTestDatabase } from './support/test-db';
import type { TestDatabase } from './support/test-db';
import { createPeople, shareHousehold } from './support/world';
import type { People } from './support/world';

/** QA-15: upload limits and safety. */
const QUOTA = 300_000;
let database: TestDatabase;
let api: TestApp;
let people: People;
let householdId: string;

beforeAll(async () => {
  database = await createTestDatabase();
  api = await createTestApp(
    testConfig({
      DATABASE_URL: database.url,
      REDIS_URL: inject('redisUrl'),
      FILES_DIR: mkdtempSync(join(tmpdir(), 'petcare-files-')),
      HOUSEHOLD_QUOTA_BYTES: String(QUOTA),
    }),
    undefined,
    { relaxRateLimits: true },
  );
  people = await createPeople(api);
  householdId = (await shareHousehold(people, { api, databaseUrl: database.url })).householdId;
});
afterAll(async () => {
  await api.close();
  await database.drop();
});

const png = (name = 'photo.png', bytes = pngOfSize()) => ({ name, type: 'image/png', bytes });
const upload = (who: 'owner' | 'caretaker' | 'viewer' | 'outsider', file = png()) =>
  people[who].client.upload({ householdId }, file);

describe('uploading', () => {
  it('stores an image and returns its metadata', async () => {
    const res = await upload('caretaker', png('../../etc/passwd.png'));
    expect(res.statusCode).toBe(201);
    const file = res.json();
    expect(file).toMatchObject({ householdId, mimeType: 'image/png', originalName: 'passwd.png' });
    expect(file.sizeBytes).toBe(pngOfSize().length);
  });

  it('rejects a file over 10 MB with 413', async () => {
    const res = await upload('owner', png('big.png', pngOfSize(10_485_760 + 1)));
    expect(res.statusCode).toBe(413);
  });

  it('rejects content that is not an allowed type with 415, whatever the name says', async () => {
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const res = await upload('owner', { name: 'photo.jpg', type: 'image/jpeg', bytes: html });
    expect(res.statusCode).toBe(415);
    expect(res.json().code).toBe('unsupportedType');
  });

  it('answers 409 quotaExceeded once the household is full', async () => {
    const ok = await upload('owner', png('a.png', pngOfSize(150_000)));
    expect(ok.statusCode).toBe(201);
    const full = await upload('owner', png('b.png', pngOfSize(150_000)));
    expect(full.statusCode).toBe(409);
    expect(full.json().code).toBe('quotaExceeded');
  });

  it('is for members who can edit: viewers 403, outsiders 404, anonymous 401', async () => {
    expect((await upload('viewer')).statusCode).toBe(403);
    expect((await upload('outsider')).statusCode).toBe(404);
    const { payload, headers } = multipartBody({ householdId }, png());
    const anonymous = await api.app.inject({
      method: 'POST',
      url: '/api/files',
      headers: { origin: 'http://localhost:5173', ...headers },
      payload,
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('needs a file and a household id', async () => {
    const res = await people.owner.client.post('/api/files', {});
    expect(res.statusCode).toBe(400);
  });
});

describe('downloading', () => {
  it('serves the stored bytes with safe headers', async () => {
    const bytes = pngOfSize(2_000);
    const id = (await upload('owner', png('x.png', bytes))).json().id as string;
    const res = await people.viewer.client.get(`/api/files/${id}`);
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(bytes)).toBe(true);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe('sandbox');
    expect(res.headers['content-disposition']).toBe('inline');
    expect(res.headers['cache-control']).toBe('private, max-age=31536000, immutable');
  });

  it('serves a PDF as an attachment', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const res = await upload('owner', { name: 'a.pdf', type: 'application/pdf', bytes: pdf });
    expect(res.statusCode).toBe(201);
    const got = await people.owner.client.get(`/api/files/${res.json().id}`);
    expect(got.headers['content-disposition']).toBe('attachment');
  });

  it('hides files from non-members and unknown ids', async () => {
    const id = (await upload('owner', png('y.png', pngOfSize(500)))).json().id as string;
    expect((await people.outsider.client.get(`/api/files/${id}`)).statusCode).toBe(404);
    expect((await new ApiClient(api).get(`/api/files/${id}`)).statusCode).toBe(401);
    expect((await people.owner.client.get('/api/files/not-a-uuid')).statusCode).toBe(404);
  });
});
