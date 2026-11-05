import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { AUTHENTICATED_LIMIT } from '../src/http/rate-limiting';
import { checkComponent } from './support/response-validator';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { createTestDatabase } from './support/test-db';
import type { TestDatabase } from './support/test-db';

// CON-petcare-001 I-07: one case per table row. Each later slice adds the rows for its routes.
let database: TestDatabase;
let api: TestApp;

beforeAll(async () => {
  database = await createTestDatabase();
  api = await createTestApp(
    testConfig({ DATABASE_URL: database.url, REDIS_URL: inject('redisUrl') }),
    undefined,
    {
      extraRoutes(app) {
        app.get('/__test/limited', { config: { rateLimit: AUTHENTICATED_LIMIT } }, async () => ({
          ok: true,
        }));
      },
    },
  );
});
afterAll(async () => {
  await api.close();
  await database.drop();
});

describe('rate limits', () => {
  it('authenticated routes: 300 per minute, then 429 rateLimited with Retry-After', async () => {
    const hit = () => api.app.inject({ method: 'GET', url: '/__test/limited' });
    for (let i = 0; i < 300; i++) expect((await hit()).statusCode).toBe(200);
    const res = await hit();
    expect(res.statusCode).toBe(429);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.json().code).toBe('rateLimited');
    expect(checkComponent('Problem', res.json())).toBeNull();
  });

  it('counts per client address (X-Forwarded-For from the trusted proxy)', async () => {
    const res = await api.app.inject({
      method: 'GET',
      url: '/__test/limited',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    expect(res.statusCode).toBe(200);
  });

  it('public system routes have no limit (they have no row in the contract table)', async () => {
    for (let i = 0; i < 320; i++) {
      expect((await api.app.inject({ method: 'GET', url: '/api/config' })).statusCode).toBe(200);
      expect((await api.app.inject({ method: 'GET', url: '/api/health' })).statusCode).toBe(200);
    }
  });
});
