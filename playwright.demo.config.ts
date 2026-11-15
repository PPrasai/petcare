import { defineConfig, devices } from '@playwright/test';

// The demo needs no server: run the production build alone, with /api unreachable.
export default defineConfig({
  testDir: 'e2e',
  testMatch: ['demo-offline.spec.ts', 'demo.spec.ts', 'audit-a-demo.spec.ts'],
  forbidOnly: true,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @petcare/web preview',
    url: 'http://localhost:4173',
    timeout: 120_000,
    env: { API_TARGET: 'http://127.0.0.1:3999' },
    reuseExistingServer: false,
  },
});
