import { expect, test } from '@playwright/test';
import { addPet, addReminder, signUp, waitSynced } from './support/app';
import { findV2Shapes, guardV2Writes } from './support/no-v2-writes';

// P5 (R-2): the server accepts CON-003, but nothing in the UI may write its shapes yet.
// `signUp` installs the same guard on every page of the suite. Deleted in P6.
const push = (mutation: Record<string, unknown>) => ({ mutations: [mutation] });

test('the detector names each CON-003-only shape and passes existing ones', () => {
  expect(findV2Shapes(push({ type: 'careLog', fields: {} }))).toEqual(['type careLog']);
  expect(findV2Shapes(push({ type: 'mealPreset', fields: {} }))).toEqual(['type mealPreset']);
  expect(findV2Shapes(push({ type: 'reminder', fields: { category: 'walk' } }))).toEqual([
    'reminder.category',
  ]);
  expect(findV2Shapes(push({ type: 'reminder', fields: { audienceUserId: null } }))).toEqual([
    'audienceUserId',
  ]);
  expect(
    findV2Shapes(push({ type: 'reminder', fields: { schedule: { kind: 'yearly' } } })),
  ).toEqual(['schedule.kind yearly']);
  expect(
    findV2Shapes(
      push({ type: 'medication', fields: { schedule: { notBefore: '2026-01-01T00:00:00Z' } } }),
    ),
  ).toEqual(['schedule.notBefore']);
  // `category` is an ordinary expense and document field.
  expect(findV2Shapes(push({ type: 'expense', fields: { category: 'vet' } }))).toEqual([]);
  expect(
    findV2Shapes(
      push({ type: 'reminder', fields: { schedule: { kind: 'daily', times: ['08:00'] } } }),
    ),
  ).toEqual([]);
  expect(findV2Shapes(null)).toEqual([]);
});

test('the guard sees a real push, blocks a v2 body, and the usual flows trip nothing', async ({
  page,
}) => {
  await signUp(page, 'no-v2');
  const found: string[][] = [];
  // A later route wins over the one `signUp` installed, so this run reports to the test.
  const guard = await guardV2Writes(page, { report: (f) => found.push(f) });

  await addPet(page, 'Momo');
  await page.getByRole('tab', { name: 'Care' }).click();
  await addReminder(page, { title: 'Walk', repeat: 'Daily', time: '18:00', time2: '07:30' });
  await addReminder(page, { title: 'Brush', repeat: 'Weekly', days: ['Sat'] });
  await waitSynced(page);
  expect(guard.pushes()).toBeGreaterThan(0);
  expect(found).toEqual([]);

  const blocked = await page.evaluate(async () => {
    try {
      await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mutations: [{ type: 'careLog', fields: {} }] }),
      });
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  expect(found).toEqual([['type careLog']]);
});
