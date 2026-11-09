import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { forEachCell, walkScreens } from './matrix';
import type { Cell } from './matrix';

/**
 * The non-gating review pack (SPEC-petcare-003 §6.4): `pnpm shots` walks support/screens.ts at both
 * widths and themes and writes test-results/pebble-shots/<id>-<w>-<theme>.png, with an index.html
 * that puts each screen next to its mock screenshot from .aeom/design/screens/ when there is one.
 */
const OUT = 'test-results/pebble-shots';

/** The mock screenshot number of each screen that has one (SPEC-petcare-003 §5.1, column Mock). */
const MOCK: Record<string, string> = {
  'S-04 normal': '11-emergency',
  'S-04 lost': '12-emergency-lost',
  'S-09 chooser': '17-log-sheet',
  'S-09 weight': '18-log-weight',
  'S-10': '01-home',
  'S-11 overview': '02-profile-overview',
  'S-17': '06-more',
};

const slug = (id: string) => id.replaceAll(' ', '-');
const taken: { id: string; cell: Cell }[] = [];

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

forEachCell('shots', (cell, browser) =>
  walkScreens(cell, browser, async (page, screen) => {
    // Let the display font and any transition settle, so a capture is not mid-change.
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `${OUT}/${slug(screen.id)}-${cell.width.w}-${cell.theme}.png`,
      fullPage: true,
    });
    taken.push({ id: screen.id, cell });
    return [];
  }),
);

test.afterAll(() => {
  const ids = [...new Set(taken.map((s) => s.id))];
  const rows = ids.map((id) => {
    const cells = taken
      .filter((s) => s.id === id)
      .map(({ cell }) => {
        const mine = `${slug(id)}-${cell.width.w}-${cell.theme}.png`;
        const mock = MOCK[id];
        const theirs = mock
          ? `<figure><img src="../../.aeom/design/screens/${mock}-${cell.width.w}-${cell.theme}.png" alt="Mock ${mock}"><figcaption>mock</figcaption></figure>`
          : '';
        return `<div class="cell"><b>${cell.label}</b><div class="pair"><figure><img src="${mine}" alt="${id}"><figcaption>built</figcaption></figure>${theirs}</div></div>`;
      })
      .join('');
    return `<section><h2>${id}</h2>${cells}</section>`;
  });
  writeFileSync(
    `${OUT}/index.html`,
    `<!doctype html><meta charset="utf-8"><title>Pebble screens</title><style>body{font:14px system-ui;margin:20px}.pair{display:flex;gap:12px;align-items:flex-start}img{max-width:420px;border:1px solid #ccc}.cell{margin:0 0 16px}</style><h1>Pebble review pack</h1>${rows.join('')}`,
  );
});
