#!/usr/bin/env node
// QA-36 (AS-petcare-002 v0.4.0): the production web build stays within the Pebble budgets
// (SPEC-petcare-002 5.2). KB = 1,024 B. Each precached file is counted once, by URL.
//   - the two font files together are at most 110 KB and are in the service worker's precache;
//   - precached bytes grew by at most 280 KB against scripts/bundle-baseline.json;
//   - the entry JS chunk grew by at most 25 KB gzipped against the same baseline;
//   - per-slice ratchet over the `readings` list in the baseline: the build matches the last
//     reading within 4 KB precache and 2 KB entry gzip, and the last reading is at most
//     24 KB precache and 8 KB entry gzip above the one before it.
// A breach is a Discovery, never a threshold edit.
// It reads apps/web/dist, so run it after `pnpm --filter @petcare/web build` (the e2e step builds it).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dist = join(root, 'apps', 'web', 'dist');
const KB = 1024;
const FONT_LIMIT = 110 * KB;
const PRECACHE_GROWTH_LIMIT = 280 * KB;
const ENTRY_GZIP_GROWTH_LIMIT = 25 * KB;
const STEP_PRECACHE = 24 * KB;
const STEP_ENTRY_GZIP = 8 * KB;
const TOL_PRECACHE = 4 * KB;
const TOL_ENTRY_GZIP = 2 * KB;

if (!existsSync(join(dist, 'sw.js'))) {
  console.error('bundle budget: apps/web/dist/sw.js is missing; build the web app first');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(join(root, 'scripts', 'bundle-baseline.json'), 'utf8'));
const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
const precached = [...new Set([...sw.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]))];
const sizeOf = (url) => {
  const path = join(dist, url.split('?')[0]);
  return existsSync(path) ? statSync(path).size : 0;
};

const failures = [];
const fonts = precached.filter((url) => url.endsWith('.woff2'));
const fontBytes = fonts.reduce((sum, url) => sum + sizeOf(url), 0);
if (fonts.length !== 2) failures.push(`expected 2 precached .woff2 files, found ${fonts.length}`);
if (fontBytes > FONT_LIMIT) failures.push(`fonts are ${fontBytes} B, over ${FONT_LIMIT} B`);

const precacheBytes = precached.reduce((sum, url) => sum + sizeOf(url), 0);
const precacheGrowth = precacheBytes - baseline.precacheBytes;
if (precacheGrowth > PRECACHE_GROWTH_LIMIT) {
  failures.push(`precache grew ${precacheGrowth} B, over ${PRECACHE_GROWTH_LIMIT} B`);
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entry = /<script[^>]+src="\/(assets\/[^"]+\.js)"/.exec(html)?.[1];
let entryGrowth = null;
let entryGzip = null;
if (!entry) failures.push('could not find the entry script in dist/index.html');
else {
  entryGzip = gzipSync(readFileSync(join(dist, entry))).length;
  entryGrowth = entryGzip - baseline.entryChunkGzipBytes;
  if (entryGrowth > ENTRY_GZIP_GROWTH_LIMIT) {
    failures.push(`entry chunk grew ${entryGrowth} B gzipped, over ${ENTRY_GZIP_GROWTH_LIMIT} B`);
  }
}

const readings = baseline.readings ?? [];
const last = readings.at(-1);
const prev = readings.at(-2);
const reading = JSON.stringify({
  slice: '<slice>',
  commit: '<commit>',
  precacheBytes,
  entryChunkGzipBytes: entryGzip,
});
let stepNote = 'no readings';
if (last && entryGzip !== null) {
  const dP = precacheBytes - last.precacheBytes;
  const dE = entryGzip - last.entryChunkGzipBytes;
  stepNote = `vs last reading ${last.slice}: ${dP >= 0 ? '+' : ''}${dP} B precache (tol ${TOL_PRECACHE}), ${dE >= 0 ? '+' : ''}${dE} B entry gzip (tol ${TOL_ENTRY_GZIP})`;
  if (Math.abs(dP) > TOL_PRECACHE || Math.abs(dE) > TOL_ENTRY_GZIP) {
    failures.push(`the build differs from the last reading (${last.slice}); record it: ${reading}`);
  }
}
if (last && prev) {
  const sP = last.precacheBytes - prev.precacheBytes;
  const sE = last.entryChunkGzipBytes - prev.entryChunkGzipBytes;
  stepNote += `; step ${prev.slice} -> ${last.slice}: ${sP >= 0 ? '+' : ''}${sP} B precache (limit ${STEP_PRECACHE}), ${sE >= 0 ? '+' : ''}${sE} B entry gzip (limit ${STEP_ENTRY_GZIP})`;
  if (sP > STEP_PRECACHE)
    failures.push(`${last.slice} step is +${sP} B precache, over ${STEP_PRECACHE} B`);
  if (sE > STEP_ENTRY_GZIP)
    failures.push(`${last.slice} step is +${sE} B entry gzip, over ${STEP_ENTRY_GZIP} B`);
}

console.log(
  `bundle budget: fonts ${fontBytes} B (limit ${FONT_LIMIT}), precache ${precacheBytes} B ` +
    `(${precacheGrowth >= 0 ? '+' : ''}${precacheGrowth} vs baseline, limit +${PRECACHE_GROWTH_LIMIT}), ` +
    `entry gzip growth ${entryGrowth ?? 'n/a'} B (limit +${ENTRY_GZIP_GROWTH_LIMIT}); ${stepNote}; reading ${reading}`,
);
if (failures.length) {
  for (const failure of failures) console.error(`bundle budget FAILED: ${failure}`);
  process.exit(1);
}
