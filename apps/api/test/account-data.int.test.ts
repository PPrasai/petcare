import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ApiClient } from './support/api-client';
import { pngOfSize } from './support/multipart';
import { mutation, pushOne } from './support/sync-helpers';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { createTestDatabase, sql } from './support/test-db';
import type { TestDatabase } from './support/test-db';
import { createPeople, shareHousehold } from './support/world';
import type { People } from './support/world';
import { readZip } from './support/zip';

/** CAP-19: export everything, delete the account and what only the user owns (AS 4.8). */
const CONFIRM = { confirm: 'DELETE MY ACCOUNT' };
let database: TestDatabase;
let api: TestApp;
let people: People;
let filesDir: string;
let householdId: string;
let fileId: string;
let petId: string;
const png = pngOfSize();

beforeAll(async () => {
  database = await createTestDatabase();
  filesDir = mkdtempSync(join(tmpdir(), 'petcare-account-'));
  api = await createTestApp(
    testConfig({ DATABASE_URL: database.url, REDIS_URL: inject('redisUrl'), FILES_DIR: filesDir }),
    undefined,
    { relaxRateLimits: true },
  );
  people = await createPeople(api);
  householdId = (await shareHousehold(people, { api, databaseUrl: database.url })).householdId;

  const upload = await people.owner.client.upload(
    { householdId },
    { name: '../vet report.png', type: 'image/png', bytes: png },
  );
  expect(upload.statusCode).toBe(201);
  fileId = upload.json().id;
  const pet = mutation(householdId, 'pet', 'create', { name: 'Momo', species: 'dog' });
  expect((await pushOne(people.owner.client, pet)).status).toBe('applied');
  petId = pet.id;
  const document = mutation(householdId, 'document', 'create', {
    petId,
    title: 'Vet report',
    category: 'vetRecord',
    fileId,
  });
  expect((await pushOne(people.caretaker.client, document)).status).toBe('applied');
});
afterAll(async () => {
  await api.close();
  await database.drop();
});

describe('export', () => {
  it('is a ZIP with data.json and the files of every household the user belongs to', async () => {
    const res = await people.caretaker.client.get('/api/me/export');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(String(res.headers['content-disposition'])).toContain('attachment');
    const zip = readZip(res.rawPayload);
    const data = JSON.parse(String(zip.get('data.json')));
    expect(data.user.email).toBe(people.caretaker.email);
    expect(data.households.map((h: { id: string }) => h.id)).toContain(householdId);
    const types = data.records.map((r: { type: string }) => r.type);
    expect(types).toEqual(expect.arrayContaining(['pet', 'document']));
    expect(data.records.find((r: { type: string }) => r.type === 'pet').data.name).toBe('Momo');

    const [file] = data.files.filter((f: { id: string }) => f.id === fileId);
    expect(file.path).toBe(`files/${householdId}/${fileId}-vet report.png`);
    expect(zip.get(file.path)?.equals(png)).toBe(true);
  });

  it("never includes another household's data", async () => {
    const res = await people.outsider.client.get('/api/me/export');
    const data = JSON.parse(String(readZip(res.rawPayload).get('data.json')));
    expect(data.households.map((h: { id: string }) => h.id)).not.toContain(householdId);
    expect(data.records.filter((r: { type: string }) => r.type === 'pet')).toEqual([]);
    expect(data.files).toEqual([]);
  });

  it('needs a signed-in user', async () => {
    expect((await new ApiClient(api).get('/api/me/export')).statusCode).toBe(401);
  });
});

describe('deleting the account', () => {
  it('needs the exact confirmation', async () => {
    const c = people.viewer.client;
    expect((await c.request('DELETE', '/api/me', {})).statusCode).toBe(400);
    expect((await c.request('DELETE', '/api/me', { confirm: 'yes' })).statusCode).toBe(400);
    expect((await c.get('/api/me')).statusCode).toBe(200);
    expect((await new ApiClient(api).request('DELETE', '/api/me', CONFIRM)).statusCode).toBe(401);
  });

  it('is blocked for the only owner of a household that has other members', async () => {
    const res = await people.owner.client.request('DELETE', '/api/me', CONFIRM);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('soleOwner');
    expect((await people.owner.client.get('/api/me')).statusCode).toBe(200);
  });

  it('removes a member and their personal data but keeps shared records', async () => {
    const c = people.caretaker.client;
    expect((await c.post('/api/calendar/link')).statusCode).toBe(201);
    expect(
      (
        await c.post('/api/push/subscriptions', {
          endpoint: 'https://push.example.test/caretaker',
          keys: { p256dh: 'k', auth: 'a' },
        })
      ).statusCode,
    ).toBe(201);

    expect((await c.request('DELETE', '/api/me', CONFIRM)).statusCode).toBe(204);
    expect((await c.get('/api/me')).statusCode).toBe(401);

    const count = async (table: string, column: string) =>
      Number(
        (
          await sql<{ n: string }>(
            database.url,
            `SELECT count(*) AS n FROM ${table} WHERE ${column} = $1`,
            [people.caretaker.userId],
          )
        )[0]?.n,
      );
    expect(await count('"user"', 'id')).toBe(0);
    expect(await count('memberships', 'user_id')).toBe(0);
    expect(await count('push_subscriptions', 'user_id')).toBe(0);
    expect(await count('calendar_tokens', 'user_id')).toBe(0);
    expect(await count('user_preferences', 'user_id')).toBe(0);
    expect(await count('session', 'user_id')).toBe(0);
    expect(await count('account', 'user_id')).toBe(0);

    // The document they added stays in the shared household, attributed to an id that no longer exists.
    const owner = await people.owner.client.get('/api/sync/pull');
    const doc = owner.json().changes.find((r: { type: string }) => r.type === 'document');
    expect(doc.createdBy).toBe(people.caretaker.userId);
    expect(existsSync(join(filesDir, householdId, fileId))).toBe(true);
  });

  it('deletes a household the user alone belongs to, with its files', async () => {
    const solo = people.outsider;
    const own = (await solo.client.get('/api/me')).json().households[0].id as string;
    const upload = await solo.client.upload(
      { householdId: own },
      { name: 'x.png', type: 'image/png', bytes: png },
    );
    expect(upload.statusCode).toBe(201);
    expect(existsSync(join(filesDir, own, upload.json().id))).toBe(true);

    expect((await solo.client.request('DELETE', '/api/me', CONFIRM)).statusCode).toBe(204);
    const rows = await sql(database.url, 'SELECT id FROM households WHERE id = $1', [own]);
    expect(rows).toEqual([]);
    const files = await sql(database.url, 'SELECT id FROM file_objects WHERE household_id = $1', [
      own,
    ]);
    expect(files).toEqual([]);
    expect(existsSync(join(filesDir, own))).toBe(false);
  });

  it('is allowed once ownership has been transferred', async () => {
    const transfer = await people.owner.client.post(
      `/api/households/${householdId}/transfer-ownership`,
      { userId: people.viewer.userId },
    );
    expect(transfer.statusCode).toBe(200);
    expect((await people.owner.client.request('DELETE', '/api/me', CONFIRM)).statusCode).toBe(204);
    const members = (
      await people.viewer.client.get(`/api/households/${householdId}/members`)
    ).json();
    expect(members.map((m: { userId: string }) => m.userId)).toEqual([people.viewer.userId]);
  });
});
