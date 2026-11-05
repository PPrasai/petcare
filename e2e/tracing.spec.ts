import { expect, test } from '@playwright/test';
import { signUp } from './support/app';

// QA-08 (browser tier): same-origin API calls carry a W3C traceparent, and batches go to the relay.
test('API requests carry a traceparent and the browser relays its spans', async ({ page }) => {
  const traceparents: string[] = [];
  let relayed = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/telemetry/v1/traces') relayed += 1;
    else if (url.pathname.startsWith('/api/') && request.headers()['traceparent']) {
      traceparents.push(request.headers()['traceparent'] ?? '');
    }
  });

  await signUp(page, 'tracing');
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect.poll(() => traceparents.length, { timeout: 15_000 }).toBeGreaterThan(0);
  for (const value of traceparents) expect(value).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);

  // The batch is exported on a timer and when the page is hidden; hiding is the quick way.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => relayed, { timeout: 15_000 }).toBeGreaterThan(0);
});
