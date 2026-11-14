import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';

let counter = 0;
export const uniqueEmail = (label: string) => `${label}-${Date.now()}-${counter++}@example.test`;

/** Creates an account through the sign-up page and waits for the signed-in shell. */
export async function signUp(page: Page, label = 'e2e') {
  const email = uniqueEmail(label);
  // Sign-up is limited to 5 a minute per client IP; each test pretends to be its own client.
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.${octet()}.${octet()}` });
  await page.goto('/sign-up');
  await page.getByLabel('Your name').fill(`${label} Person`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  return email;
}

export async function addPet(page: Page, name: string) {
  await page.getByRole('link', { name: 'Home', exact: true }).first().click();
  await page.getByRole('link', { name: 'Add a pet' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Save pet' }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** A UUID v7 (the server validates ids as such). */
function uuid7(): string {
  const hex = Date.now().toString(16).padStart(12, '0');
  const random = crypto.getRandomValues(new Uint8Array(10));
  const r = Array.from(random, (b) => b.toString(16).padStart(2, '0')).join('');
  const variant = ((parseInt(r.slice(4, 6), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${r.slice(0, 3)}-${variant}${r.slice(6, 8)}-${r.slice(8, 20)}`;
}

export interface ReminderInput {
  title: string;
  /** The type chip to press first; the sheet starts on Walk. Pressing one renames the reminder. */
  type?: 'Walk' | 'Medication' | 'Grooming' | 'Vet visit' | 'Weigh-in' | 'Other';
  repeat?: 'Once' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
  time?: string;
  /** Who is reminded; the sheet starts on Everyone. */
  who?: 'Everyone' | 'Just me';
  time2?: string;
  /** For Once and Monthly; defaults to the sheet's own date (today). */
  date?: string;
  /** For Once: that many days before the sheet's own date (today). */
  daysAgo?: number;
  /** For Weekly, as shown on the chips (Mon ... Sun). */
  days?: string[];
}

/** On a pet's Care tab: opens "New reminder", fills it and saves. */
export async function addReminder(page: Page, r: ReminderInput) {
  await page.getByRole('button', { name: /^Add a reminder for/ }).click();
  const sheet = page.getByRole('dialog', { name: 'New reminder' });
  if (r.type) {
    await sheet
      .getByRole('group', { name: 'What to remind about' })
      .getByRole('button', { name: r.type, exact: true })
      .click();
  }
  await sheet.getByLabel('Reminder name').fill(r.title);
  if (r.repeat) {
    await sheet
      .getByRole('group', { name: 'Repeat' })
      .getByRole('button', { name: r.repeat, exact: true })
      .click();
  }
  for (const day of r.days ?? []) {
    await sheet
      .getByRole('group', { name: 'Days of the week' })
      .getByRole('button', { name: day, exact: true })
      .click();
  }
  if (r.date) {
    await sheet
      .getByLabel(r.repeat === 'Monthly' || r.repeat === 'Yearly' ? 'Starting' : 'Date')
      .fill(r.date);
  }
  if (r.daysAgo) {
    const field = sheet.getByLabel('Date');
    const today = await field.inputValue();
    const past = new Date(Date.parse(`${today}T00:00:00Z`) - r.daysAgo * 86_400_000);
    await field.fill(past.toISOString().slice(0, 10));
  }
  if (r.time) await sheet.getByLabel('Time', { exact: true }).fill(r.time);
  if (r.who) await sheet.getByLabel('Remind', { exact: true }).selectOption({ label: r.who });
  if (r.time2) await sheet.getByLabel('Second time (optional)').fill(r.time2);
  await sheet.getByRole('button', { name: 'Save reminder' }).click();
  await expect(sheet).toBeHidden();
}

/**
 * Puts a care routine on the server for the account's first pet, as an increment-1 client would
 * have made it (the app no longer creates routines), and reloads so this device pulls it. It
 * starts today, daily at 00:01, so it is overdue now.
 */
export async function pushRoutine(
  page: Page,
  routine: { title: string; kind: 'feeding' | 'walk' | 'grooming' },
) {
  await waitSynced(page);
  const me = await (await page.request.get('/api/me')).json();
  const pull = await (await page.request.get('/api/sync/pull')).json();
  const pet = pull.changes.find((c: { type: string }) => c.type === 'pet');
  // The account's own time zone (UTC unless changed), not the machine's: the app lists a task on
  // the calendar day it has in that zone, so a routine in another zone can fall on yesterday.
  const tz: string = me.preferences?.timeZone ?? 'UTC';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const res = await page.request.post('/api/sync/push', {
    headers: { origin: 'http://localhost:4173' },
    data: {
      clientId: uuid7(),
      mutations: [
        {
          mutationId: uuid7(),
          type: 'careRoutine',
          id: uuid7(),
          householdId: me.households[0].id,
          op: 'create',
          baseVersion: 0,
          fields: {
            petId: pet.id,
            kind: routine.kind,
            title: routine.title,
            active: true,
            schedule: { tz, kind: 'daily', startOn: today, times: ['00:01'] },
          },
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });
  expect(res.status()).toBe(200);
  await page.reload();
}

/** Waits until nothing is waiting to sync. */
export async function waitSynced(page: Page) {
  await expect(page.getByTestId('pending-count')).toHaveAttribute('data-count', '0', {
    timeout: 15_000,
  });
}

export async function userId(page: Page): Promise<string> {
  const res = await page.request.get('/api/me');
  return (await res.json()).user.id as string;
}

/** Opens a disclosure by its title (for example "Vet visits" on the Health tab). */
export async function openDisclosure(page: Page, title: string) {
  await page.locator('summary').filter({ hasText: title }).click();
}

/** Opens the "Details" disclosure on a pet's Overview tab. */
export async function openDetails(page: Page) {
  await openDisclosure(page, 'Details');
}

/**
 * Makes an account with a pet whose emergency card is shared, and returns the public path a
 * finder would open. With `lost` the pet is marked as lost with a message.
 */
export async function shareEmergencyCard(
  browser: Browser,
  options: { lost?: boolean } = {},
): Promise<string> {
  const context = await browser.newContext({ baseURL: 'http://localhost:4173' });
  try {
    const page = await context.newPage();
    await signUp(page, 'public-card');
    await addPet(page, 'Momo');
    await page.getByRole('link', { name: 'Emergency card' }).click();
    await page.getByRole('button', { name: 'Set up card' }).click();
    await page.getByLabel('My name', { exact: true }).check();
    await page.getByLabel('Name to show').fill('Sam Owner');
    await page.getByLabel('My phone number', { exact: true }).check();
    await page.getByLabel('Phone number to show').fill('+1 555 0100');
    await page.getByLabel('Notes', { exact: true }).check();
    await page.getByLabel('Notes for a finder').fill('Shy, will hide');
    await page.getByRole('button', { name: 'Save card' }).click();
    await expect(page.locator('.toast').filter({ hasText: 'Saved.' })).toBeVisible();
    await waitSynced(page);
    await page.getByRole('button', { name: 'Create link' }).click();
    const link = (await page.getByTestId('emergency-link').textContent()) ?? '';
    if (options.lost) {
      await page.getByRole('button', { name: 'Mark Momo as lost' }).click();
      await page.getByLabel('Message for a finder').fill('Please call me');
      await page.getByRole('button', { name: 'Mark as lost', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Turn off lost mode' })).toBeVisible();
      await waitSynced(page);
    }
    return new URL(link).pathname;
  } finally {
    await context.close();
  }
}

/** On /household as the owner: opens the Invite sheet, picks the role and creates the invite. */
export async function createInvite(page: Page, role: 'Viewer' | 'Caretaker' = 'Caretaker') {
  await page.getByRole('button', { name: 'Invite', exact: true }).click();
  await page.getByRole('group', { name: 'Invite as' }).getByRole('button', { name: role }).click();
  await page.getByRole('button', { name: 'Create invite' }).click();
}
