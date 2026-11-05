import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addPet, signUp, uniqueEmail, waitSynced } from './support/app';

const ORIGIN = 'http://localhost:4173';
const octet = () => Math.floor(Math.random() * 250) + 1;

type Change = {
  type: string;
  id: string;
  householdId: string;
  version: number;
  data: Record<string, unknown>;
};
const pulled = async (page: Page, type: string): Promise<Change[]> => {
  const pull = await (await page.request.get('/api/sync/pull')).json();
  return pull.changes.filter((c: Change) => c.type === type);
};

/** Creates an account from the sign-up page, without expecting the main shell afterwards. */
async function signUpPlain(page: Page, label: string) {
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `198.52.${octet()}.${octet()}` });
  await page.goto('/sign-up');
  await page.getByLabel('Your name').fill(`${label} Person`);
  await page.getByLabel('Email').fill(uniqueEmail(label));
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
}

// CAP-11: invites by link and by code, roles, transfer, leave.
test('an owner invites a member by link; roles, transfer and leaving work', async ({
  page,
  browser,
}) => {
  await signUp(page, 'owner');
  await page.getByRole('link', { name: 'Household', exact: true }).click();

  // Invite as a caretaker: link, code and QR are shown once.
  await page.getByRole('button', { name: 'Create invite' }).click();
  const region = page.getByRole('region', { name: 'New invite' });
  const link = (await region.getByTestId('invite-link').textContent()) ?? '';
  expect(link).toMatch(/\/join#[A-Za-z0-9_-]{43}$/);
  await expect(
    region.getByRole('img', { name: 'QR code of the invite link' }).locator('svg'),
  ).toBeVisible();
  await region.getByRole('button', { name: 'Hide' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'Caretaker' })).toBeVisible();

  // The invitee opens the link before having an account.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(new URL(link).pathname + new URL(link).hash);
  await expect(guest.getByText('Sign in or create an account to use your invite.')).toBeVisible();
  await guest.getByRole('link', { name: 'Create your account' }).click();
  await signUpPlain(guest, 'guest');
  await expect(guest.getByRole('button', { name: 'Check my invite' })).toBeVisible();
  await guest.getByRole('button', { name: 'Check my invite' }).click();
  await expect(guest.getByText(/You are invited to .* as Caretaker/)).toBeVisible();
  await guest.getByRole('button', { name: 'Join household' }).click();
  await expect(guest.getByRole('navigation', { name: 'Main' })).toBeVisible();

  // The guest now belongs to two households and can switch between them.
  await guest.getByRole('link', { name: 'Household', exact: true }).click();
  await expect(guest.getByLabel('Household', { exact: true })).toBeVisible();

  // The owner sees the new member and makes them a viewer, then transfers ownership.
  await page.reload();
  await expect(page.getByRole('listitem').filter({ hasText: 'guest Person' })).toBeVisible();
  await page.getByLabel('Role of guest Person').selectOption('viewer');
  await expect(page.getByLabel('Role of guest Person')).toHaveValue('viewer');
  await page.getByRole('button', { name: 'Make guest Person the owner' }).click();
  await page.getByRole('button', { name: 'Transfer ownership' }).click();
  await expect(page.getByRole('button', { name: 'Create invite' })).toHaveCount(0);

  // The old owner (now a caretaker) can leave.
  await page.getByRole('button', { name: 'Leave household' }).click();
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Household' })).toBeVisible();
  await guestContext.close();
});

test('a code typed by hand works, and the last owner cannot leave', async ({ page, browser }) => {
  await signUp(page, 'coder');
  await page.getByRole('link', { name: 'Household', exact: true }).click();
  await page.getByLabel('Invite as').selectOption('viewer');
  await page.getByRole('button', { name: 'Create invite' }).click();
  const code = (await page.getByTestId('invite-code').textContent()) ?? '';

  const other = await browser.newContext();
  const friend = await other.newPage();
  await signUp(friend, 'friend');
  await friend.goto('/join');
  await friend.getByLabel('Invite code').fill(code.toLowerCase());
  await friend.getByRole('button', { name: 'Check code' }).click();
  await expect(friend.getByText(/as Viewer/)).toBeVisible();
  await friend.getByRole('button', { name: 'Join household' }).click();
  await expect(friend.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await other.close();

  await page.reload();
  await page.getByRole('button', { name: 'Leave household' }).click();
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByText('Make another member the owner before you leave.')).toBeVisible();
});

// CAP-16: a field two people changed at once shows up for review, and the value can be restored.
test('a conflict can be reviewed and its replaced value restored', async ({ page, browser }) => {
  await signUp(page, 'conf');
  await addPet(page, 'Momo');
  await waitSynced(page);
  await page.getByRole('link', { name: 'Household', exact: true }).click();
  await page.getByRole('button', { name: 'Create invite' }).click();
  const link = (await page.getByTestId('invite-link').textContent()) ?? '';

  const other = await browser.newContext();
  const mate = await other.newPage();
  await mate.goto(new URL(link).pathname + new URL(link).hash);
  await mate.getByRole('link', { name: 'Create your account' }).click();
  await signUpPlain(mate, 'mate');
  await mate.getByRole('button', { name: 'Check my invite' }).click();
  await mate.getByRole('button', { name: 'Join household' }).click();
  await expect(mate.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await waitSynced(mate);

  const [pet] = await pulled(mate, 'pet');
  if (!pet) throw new Error('the mate did not receive the pet');
  const push = (who: Page, fields: Record<string, unknown>, clientTime: string) =>
    who.request.post('/api/sync/push', {
      headers: { origin: ORIGIN },
      data: {
        clientId: crypto.randomUUID(),
        mutations: [
          {
            mutationId: crypto.randomUUID(),
            type: 'pet',
            id: pet.id,
            householdId: pet.householdId,
            op: 'update',
            baseVersion: pet.version,
            fields,
            clientTime,
          },
        ],
      },
    });
  const now = Date.now();
  expect((await push(page, { breed: 'Beagle' }, new Date(now).toISOString())).status()).toBe(200);
  expect((await push(mate, { breed: 'Pug' }, new Date(now + 60_000).toISOString())).status()).toBe(
    200,
  );
  await other.close();

  await page.getByRole('link', { name: 'Sync activity' }).click();
  await page.getByRole('button', { name: 'Sync now' }).click();
  const card = page.getByRole('listitem').filter({ hasText: 'pet: breed' });
  await expect(card).toContainText('Kept: Pug');
  await expect(card).toContainText('Replaced: Beagle');
  await page.getByRole('button', { name: 'Restore the replaced value of breed' }).click();
  await expect(page.getByText('Nothing to review.')).toBeVisible();

  await waitSynced(page);
  const [after] = await pulled(page, 'pet');
  expect(after?.data.breed).toBe('Beagle');
});
