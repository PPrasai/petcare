import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { checkComponent } from './support/response-validator';
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
    testConfig({
      DATABASE_URL: database.url,
      REDIS_URL: inject('redisUrl'),
      AUTH_GITHUB_CLIENT_ID: 'gh-id',
      AUTH_GITHUB_CLIENT_SECRET: 'gh-secret',
      AUTH_GOOGLE_CLIENT_ID: 'only-an-id',
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
    }),
  );
});

afterAll(async () => {
  await api.close();
  await database.drop();
});

describe('system routes', () => {
  it('GET /api/health is ok', async () => {
    const res = await api.app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /api/ready reports postgres and redis ok', async () => {
    const res = await api.app.inject({ method: 'GET', url: '/api/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', postgres: 'ok', redis: 'ok' });
  });

  it('GET /api/config lists only fully configured providers and the push key', async () => {
    const res = await api.app.inject({ method: 'GET', url: '/api/config' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      providers: ['github'],
      emailPasswordEnabled: true,
      vapidPublicKey: 'pub',
      limits: {
        maxFileBytes: 10_485_760,
        householdQuotaBytes: 524_288_000,
        maxMutationsPerPush: 100,
      },
    });
  });

  it('applies migrations at start (29 contract tables and 5 auth tables exist)', async () => {
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    const { rows } = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'",
    );
    await client.end();
    expect(rows[0]?.n).toBe(34);
  });
});

describe('errors are problem+json', () => {
  const headers = { origin: 'http://localhost:5173', 'content-type': 'application/json' };

  it('unknown route is 404 notFound', async () => {
    const res = await api.app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    const body = res.json();
    expect(body.code).toBe('notFound');
    expect(checkComponent('Problem', body)).toBeNull();
  });

  it('oversized JSON body is 413 tooLarge', async () => {
    const res = await api.app.inject({
      method: 'POST',
      url: '/api/anything',
      headers,
      payload: JSON.stringify({ blob: 'x'.repeat(1_100_000) }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe('tooLarge');
    expect(checkComponent('Problem', res.json())).toBeNull();
  });

  it('malformed JSON is 400 invalid', async () => {
    const res = await api.app.inject({
      method: 'POST',
      url: '/api/anything',
      headers,
      payload: '{not json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('invalid');
  });
});

describe('origin rule (CON-petcare-001 I-09)', () => {
  const post = (origin?: string, url = '/api/anything') =>
    api.app.inject({
      method: 'POST',
      url,
      headers: origin
        ? { origin, 'content-type': 'application/json' }
        : { 'content-type': 'application/json' },
      payload: '{}',
    });

  it('rejects a cross-origin write with 403 badOrigin', async () => {
    const res = await post('https://evil.example');
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('badOrigin');
    expect(checkComponent('Problem', res.json())).toBeNull();
  });

  it('rejects a write with no Origin header', async () => {
    expect((await post()).statusCode).toBe(403);
  });

  it('lets the app origin through to routing', async () => {
    expect((await post('http://localhost:5173')).statusCode).toBe(404);
  });

  it('does not apply to GET, /api/auth, /api/telemetry or /api/public', async () => {
    expect((await post('https://evil.example', '/api/auth/x')).statusCode).toBe(404);
    expect((await post('https://evil.example', '/api/telemetry/v1/traces')).statusCode).toBe(404);
    expect((await post('https://evil.example', '/api/public/emergency/abc')).statusCode).toBe(404);
    const get = await api.app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://evil.example' },
    });
    expect(get.statusCode).toBe(200);
  });
});
