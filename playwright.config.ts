import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:4173' },
});
