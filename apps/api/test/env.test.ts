import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config/env';

const secret = 'x'.repeat(32);

describe('configuration (SPEC section 5.6)', () => {
  it('uses the development defaults', () => {
    const c = loadConfig({ BETTER_AUTH_SECRET: secret });
    expect(c.port).toBe(3000);
    expect(c.appOrigin).toBe('http://localhost:5173');
    expect(c.databaseUrl).toBe('postgres://petcare:petcare@localhost:54329/petcare');
    expect(c.redisKeyPrefix).toBe('pc:');
    expect(c.sessionMaxAgeDays).toBe(30);
    expect(c.dispatchCron).toBe('* * * * *');
    expect(c.extendCron).toBe('30 2 * * *');
    expect(c.purgeCron).toBe('0 3 * * *');
    expect(c.maxFileBytes).toBe(10_485_760);
    expect(c.householdQuotaBytes).toBe(524_288_000);
    expect(c.vapid).toBeNull();
  });

  it('treats empty values as not set', () => {
    const c = loadConfig({ BETTER_AUTH_SECRET: secret, PORT: '', AUTH_GITHUB_CLIENT_ID: '' });
    expect(c.port).toBe(3000);
    expect(c.providers.github).toBeNull();
  });

  it('enables a provider only when both id and secret are set', () => {
    const c = loadConfig({
      BETTER_AUTH_SECRET: secret,
      AUTH_GITHUB_CLIENT_ID: 'a',
      AUTH_GITHUB_CLIENT_SECRET: 'b',
      AUTH_GOOGLE_CLIENT_ID: 'only-id',
    });
    expect(c.providers.github).not.toBeNull();
    expect(c.providers.google).toBeNull();
  });

  it('refuses to start on an invalid value', () => {
    expect(() => loadConfig({ BETTER_AUTH_SECRET: 'short' })).toThrow(ConfigError);
    expect(() => loadConfig({ BETTER_AUTH_SECRET: secret, PORT: 'abc' })).toThrow(ConfigError);
    expect(() => loadConfig({ BETTER_AUTH_SECRET: secret, APP_ORIGIN: 'not a url' })).toThrow(
      ConfigError,
    );
  });

  it('has no defaults for connection strings in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', BETTER_AUTH_SECRET: secret })).toThrow(
      ConfigError,
    );
    const c = loadConfig({
      NODE_ENV: 'production',
      BETTER_AUTH_SECRET: secret,
      DATABASE_URL: 'postgres://u:p@postgres:5432/petcare',
      REDIS_URL: 'redis://:p@redis:6379',
    });
    expect(c.port).toBe(8002);
    expect(c.logLevel).toBe('info');
    expect(c.filesDir).toBe('/data/files');
  });
});
