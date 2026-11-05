import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ApiClient, uniqueEmail } from './support/api-client';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { createTestDatabase } from './support/test-db';
import type { TestDatabase } from './support/test-db';

// Password recovery path (b): the operator CLI prints a one-time reset URL (PO section 9 A-03).
const run = promisify(execFile);
const apiDir = join(dirname(fileURLToPath(import.meta.url)), '..');
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

function cli(email: string) {
  return run(process.execPath, ['--import', 'tsx', 'src/cli/index.ts', 'reset-link', email], {
    cwd: apiDir,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: database.url,
      BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
      APP_ORIGIN: 'http://localhost:5173',
      OTEL_SDK_DISABLED: 'true',
    },
  });
}

describe('pnpm cli reset-link <email>', () => {
  it('prints a URL that resets the password, and the old password stops working', async () => {
    const email = uniqueEmail('forgot');
    await new ApiClient(api).signUp(email, 'Forgetful Person', 'old-password-123');

    const { stdout } = await cli(email);
    const url = new URL(stdout.trim());
    expect(url.origin).toBe('http://localhost:5173');
    expect(url.pathname).toBe('/reset-password');
    const token = url.searchParams.get('token');
    expect(token).toBeTruthy();

    // The token is valid for 30 minutes.
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    const { rows } = await client.query<{ minutes: number }>(
      "SELECT extract(epoch FROM (expires_at - now())) / 60 AS minutes FROM verification WHERE identifier LIKE 'reset-password:%'",
    );
    await client.end();
    const minutes = Number(rows[0]?.minutes);
    expect(minutes).toBeGreaterThan(28);
    expect(minutes).toBeLessThanOrEqual(30);

    const web = new ApiClient(api);
    const reset = await web.post('/api/auth/reset-password', {
      token,
      newPassword: 'brand-new-password-9',
    });
    expect(reset.statusCode).toBe(200);

    expect((await new ApiClient(api).signIn(email, 'old-password-123')).statusCode).toBe(401);
    expect((await new ApiClient(api).signIn(email, 'brand-new-password-9')).statusCode).toBe(200);
    // One-time: the same link cannot be used again.
    const again = await web.post('/api/auth/reset-password', {
      token,
      newPassword: 'another-pass-123',
    });
    expect(again.statusCode).toBe(400);
  });

  it('exits non-zero and prints no URL for an unknown email', async () => {
    await expect(cli('nobody@example.test')).rejects.toMatchObject({ code: 1 });
  });
});
