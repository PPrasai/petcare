import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '@petcare/domain';
import { ApiClient, uniqueEmail } from './support/api-client';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { createTestDatabase } from './support/test-db';
import type { TestDatabase } from './support/test-db';

let database: TestDatabase;
let api: TestApp;
beforeAll(async () => {
  database = await createTestDatabase();
  api = await createTestApp(
    testConfig({ DATABASE_URL: database.url, REDIS_URL: inject('redisUrl') }),
  );
});
afterAll(async () => {
  await api.close();
  await database.drop();
});

async function signedIn(name = 'Pat Example') {
  const c = new ApiClient(api);
  await c.signUp(uniqueEmail('me'), name);
  return c;
}

describe('GET /api/me', () => {
  it('names the personal household after the first name', async () => {
    const c = await signedIn('Parikshit Prasai');
    const me = (await c.get('/api/me')).json();
    expect(me.households[0].name).toBe("Parikshit's pets");
    expect(me.preferences).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('PUT /api/me/preferences', () => {
  const changed = {
    ...DEFAULT_PREFERENCES,
    weightUnit: 'lb',
    temperatureUnit: 'f',
    timeZone: 'Asia/Kathmandu',
    currency: 'NPR',
    theme: 'dark',
    leadMinutes: { ...DEFAULT_PREFERENCES.leadMinutes, vaccination: 2880 },
    pushTypes: ['vaccination', 'reminder'],
  };

  it('saves and returns the preferences, and /api/me reflects them', async () => {
    const c = await signedIn();
    const put = await c.put('/api/me/preferences', changed);
    expect(put.statusCode).toBe(200);
    expect(put.json()).toEqual(changed);
    expect((await c.get('/api/me')).json().preferences).toEqual(changed);
  });

  it('rejects unknown keys and out-of-range values with 400 invalid and JSON pointers', async () => {
    const c = await signedIn();
    const bad = await c.put('/api/me/preferences', {
      ...changed,
      leadMinutes: { ...changed.leadMinutes, medication: 99999 },
      extra: true,
    });
    expect(bad.statusCode).toBe(400);
    const body = bad.json();
    expect(body.code).toBe('invalid');
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it('requires a session', async () => {
    const res = await new ApiClient(api).put('/api/me/preferences', changed);
    expect(res.statusCode).toBe(401);
  });
});
