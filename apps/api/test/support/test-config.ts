import { randomUUID } from 'node:crypto';
import { loadConfig } from '../../src/config/env';
import type { Config } from '../../src/config/env';

/** A valid test configuration. Pass overrides as raw environment values. */
export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://localhost:5173',
    BETTER_AUTH_SECRET: 'test-secret-test-secret-test-secret-123',
    REDIS_KEY_PREFIX: `t${randomUUID().slice(0, 8)}:`,
    OTEL_SDK_DISABLED: 'true',
    LOG_LEVEL: 'silent',
    RUN_JOBS: 'false',
    ...env,
  });
}
