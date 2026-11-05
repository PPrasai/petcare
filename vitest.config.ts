import { defineConfig } from 'vitest/config';

const common = { exclude: ['**/node_modules/**', '**/dist/**'] };

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          ...common,
          include: ['packages/*/test/**/*.test.ts', 'apps/web/src/**/*.test.{ts,tsx}'],
        },
      },
      {
        // API tests: unit tests run anywhere; *.int.test.ts need Docker (testcontainers).
        test: {
          name: 'api',
          ...common,
          include: ['apps/api/test/**/*.test.ts'],
          globalSetup: ['apps/api/test/global-setup.ts'],
          setupFiles: ['apps/api/test/setup.ts'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
      {
        test: {
          name: 'system',
          ...common,
          include: ['tests/system/**/*.test.ts'],
          globalSetup: ['apps/api/test/global-setup.ts'],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
