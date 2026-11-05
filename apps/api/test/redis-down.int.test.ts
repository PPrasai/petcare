import { GenericContainer } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AUTHENTICATED_LIMIT } from '../src/http/rate-limiting';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { createTestDatabase } from './support/test-db';
import type { TestDatabase } from './support/test-db';

// QA-11: Redis unreachable at start and mid-run -> every endpoint still works from Postgres.
let database: TestDatabase;
const apps: TestApp[] = [];
let redis: StartedTestContainer | undefined;

beforeAll(async () => {
  database = await createTestDatabase();
});
afterAll(async () => {
  for (const a of apps) await a.close();
  await redis?.stop().catch(() => undefined);
  await database.drop();
});

const endpoints = ['/api/health', '/api/config'];
async function everyEndpointWorks(app: TestApp): Promise<void> {
  for (const url of endpoints) {
    expect((await app.app.inject({ method: 'GET', url })).statusCode, url).toBe(200);
  }
}

describe('Redis down at start', () => {
  it('starts, serves every endpoint, and reports degraded with HTTP 200', async () => {
    const app = await createTestApp(
      testConfig({ DATABASE_URL: database.url, REDIS_URL: 'redis://127.0.0.1:1' }),
      undefined,
      {
        extraRoutes(instance) {
          instance.get(
            '/__test/limited',
            { config: { rateLimit: AUTHENTICATED_LIMIT } },
            async () => ({
              ok: true,
            }),
          );
        },
      },
    );
    apps.push(app);
    await everyEndpointWorks(app);
    const ready = await app.app.inject({ method: 'GET', url: '/api/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'degraded', postgres: 'ok', redis: 'degraded' });
  });

  it('rate limiting falls back to this process (still 429 after 300)', async () => {
    const app = apps[0];
    if (!app) throw new Error('previous test did not create the app');
    let last = 0;
    for (let i = 0; i < 305; i++) {
      last = (await app.app.inject({ method: 'GET', url: '/__test/limited' })).statusCode;
    }
    expect(last).toBe(429);
  });
});

describe('Redis goes down mid-run', () => {
  it('is ok while Redis is up, degraded after it stops, and no request fails', async () => {
    redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
    const app = await createTestApp(
      testConfig({
        DATABASE_URL: database.url,
        REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
      }),
    );
    apps.push(app);
    await everyEndpointWorks(app);
    expect((await app.app.inject({ method: 'GET', url: '/api/ready' })).json().redis).toBe('ok');

    await redis.stop();
    redis = undefined;

    await everyEndpointWorks(app);
    const ready = await app.app.inject({ method: 'GET', url: '/api/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'degraded', postgres: 'ok', redis: 'degraded' });
  });
});
