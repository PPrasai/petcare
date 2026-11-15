import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { format } from 'prettier';
import { fingerprint } from './support/fingerprint-dom';
import { walkScreens } from './support/matrix';
import type { Cell } from './support/matrix';

// QA-45: the phone layout (< 860 px) is unchanged by the desktop work. For every screen state at
// 390 x 844 and 820 x 1180 the structural fingerprint must equal layout-fingerprint.json, which was
// captured before slice D1 changed anything. The file is never regenerated inside a D slice; the
// repo-hygiene check compares its hash with layout-fingerprint.sha256.
const FILE = fileURLToPath(new URL('./support/layout-fingerprint.json', import.meta.url));
const HASH = fileURLToPath(new URL('./support/layout-fingerprint.sha256', import.meta.url));
const WRITE = process.env.FINGERPRINT_WRITE === '1';
/** A fixed moment, so due dates and the time of day cannot change what a screen shows. */
const FIXED_TIME = '2026-06-15T12:00:00Z';

const SIZES = [
  { w: 390, h: 844, touch: true },
  { w: 820, h: 1180, touch: true },
] as const;

const captured: Record<string, string[]> = {};
const expected: Record<string, string[]> =
  !WRITE && existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};

test.describe.configure({ mode: 'serial' });

for (const size of SIZES) {
  const cell: Cell = { width: size, theme: 'light', label: `${size.w}x${size.h}` };
  test(`phone fingerprint @${cell.label}`, async ({ browser }) => {
    test.setTimeout(900_000);
    await walkScreens(
      cell,
      browser,
      async (page, screen) => {
        const key = `${screen.id}@${cell.label}`;
        const now = await fingerprint(page);
        captured[key] = now;
        if (WRITE) return [];
        const before = expected[key];
        if (!before) return [];
        if (JSON.stringify(before) === JSON.stringify(now)) return [];
        const at = before.findIndex((line, i) => line !== now[i]);
        const index = at === -1 ? Math.min(before.length, now.length) : at;
        return [
          `fingerprint differs at line ${index}: expected "${before[index] ?? '(end)'}", got "${now[index] ?? '(end)'}"`,
        ];
      },
      // Every state that exists on a phone, whatever widths it lists for the desktop.
      { include: (s) => (s.widths ?? [390]).includes(390), fixedTime: FIXED_TIME },
    );
  });
}

test('every state in the fingerprint file still exists', () => {
  test.skip(WRITE, 'writing');
  const missing = Object.keys(expected).filter((key) => !(key in captured));
  expect(missing, 'a state of the captured fingerprint was not visited').toEqual([]);
});

test.afterAll(async () => {
  if (!WRITE) return;
  const sorted = Object.fromEntries(Object.entries(captured).sort(([a], [b]) => (a < b ? -1 : 1)));
  // Written the way Prettier formats JSON, so `pnpm lint` accepts the file and its hash stays put.
  const text = await format(JSON.stringify(sorted), { parser: 'json' });
  writeFileSync(FILE, text);
  writeFileSync(HASH, `${createHash('sha256').update(text).digest('hex')}\n`);
});
