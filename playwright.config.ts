import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:4173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npx tsx e2e/support/stack.ts',
      url: 'http://127.0.0.1:3100/api/health',
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm --filter @petcare/web build && pnpm --filter @petcare/web preview',
      url: 'http://localhost:4173',
      timeout: 180_000,
      env: { API_TARGET: 'http://127.0.0.1:3100' },
      reuseExistingServer: false,
    },
  ],
});
