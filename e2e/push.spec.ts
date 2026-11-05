import { expect, test } from '@playwright/test';
import { signUp } from './support/app';

// CAP-07: device notifications are opt-in from Settings; iOS needs the app installed first.
test('a device can be registered for push from Settings', async ({ page }) => {
  await page.addInitScript(() => {
    let current: object | null = null;
    const fake = {
      endpoint: 'https://push.example.test/device-1',
      toJSON: () => ({ keys: { p256dh: 'BPk', auth: 'auth-secret' } }),
      unsubscribe: async () => {
        current = null;
        return true;
      },
    };
    Object.defineProperty(Notification, 'permission', { get: () => 'default' });
    Notification.requestPermission = async () => 'granted';
    PushManager.prototype.getSubscription = async () => current as never;
    PushManager.prototype.subscribe = async () => {
      current = fake;
      return fake as never;
    };
  });
  await signUp(page, 'push');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByText('Notifications are off for this device.')).toBeVisible();

  const registered = page.waitForResponse(
    (r) => r.url().endsWith('/api/push/subscriptions') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Turn on notifications' }).click();
  expect((await registered).status()).toBe(201);
  await expect(page.getByText('Notifications are on for this device.')).toBeVisible();

  const removed = page.waitForResponse(
    (r) => r.url().endsWith('/api/push/subscriptions') && r.request().method() === 'DELETE',
  );
  await page.getByRole('button', { name: 'Turn off notifications' }).click();
  expect((await removed).status()).toBe(204);
  await expect(page.getByText('Notifications are off for this device.')).toBeVisible();
});

test('iPhone users are told to add the app to the Home Screen', async ({ browser }) => {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  });
  const page = await context.newPage();
  await signUp(page, 'pushios');
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByText(/add PetCare to your Home Screen/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Turn on notifications' })).toHaveCount(0);
  await context.close();
});
