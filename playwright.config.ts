import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: true,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      // AS-A-08, SPEC-petcare-002 P8: swipe, hidden scrollbars, layout and contrast in WebKit.
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: ['layout-phone.spec.ts', 'a11y-matrix.spec.ts', 'pebble-layout.spec.ts'],
    },
  ],
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
