import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// `pnpm shots`: the same servers as the e2e run, but only the review-pack walk (not a gate).
export default defineConfig({
  ...base,
  testDir: 'e2e/support',
  testMatch: 'shots.ts',
  reporter: [['list']],
});
