#!/usr/bin/env node
// QA-36: the production web build stays within the Pebble budgets (SPEC-petcare-002 5.2).
//   - the two font files together are at most 110 KB and are in the service worker's precache;
//   - precached bytes grew by at most 160 KB against scripts/bundle-baseline.json;
//   - the entry JS chunk grew by at most 25 KB gzipped against the same baseline.
// It reads apps/web/dist, so run it after `pnpm --filter @petcare/web build` (the e2e step builds it).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const dist = join(root, 'apps', 'web', 'dist');
const KB = 1024;
const FONT_LIMIT = 110 * KB;
const PRECACHE_GROWTH_LIMIT = 160 * KB;
const ENTRY_GZIP_GROWTH_LIMIT = 25 * KB;

if (!existsSync(join(dist, 'sw.js'))) {
  console.error('bundle budget: apps/web/dist/sw.js is missing; build the web app first');
  process.exit(1);
}

const baseline = JSON.parse(readFileSync(join(root, 'scripts', 'bundle-baseline.json'), 'utf8'));
const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
const precached = [...sw.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
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
if (!entry) failures.push('could not find the entry script in dist/index.html');
else {
  const gzip = gzipSync(readFileSync(join(dist, entry))).length;
  entryGrowth = gzip - baseline.entryChunkGzipBytes;
  if (entryGrowth > ENTRY_GZIP_GROWTH_LIMIT) {
    failures.push(`entry chunk grew ${entryGrowth} B gzipped, over ${ENTRY_GZIP_GROWTH_LIMIT} B`);
  }
}

console.log(
  `bundle budget: fonts ${fontBytes} B (limit ${FONT_LIMIT}), precache ${precacheBytes} B ` +
    `(${precacheGrowth >= 0 ? '+' : ''}${precacheGrowth} vs baseline, limit +${PRECACHE_GROWTH_LIMIT}), ` +
    `entry gzip growth ${entryGrowth ?? 'n/a'} B (limit +${ENTRY_GZIP_GROWTH_LIMIT})`,
);
if (failures.length) {
  for (const failure of failures) console.error(`bundle budget FAILED: ${failure}`);
  process.exit(1);
}
