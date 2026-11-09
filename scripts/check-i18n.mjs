#!/usr/bin/env node
// QA-38: every message key used in apps/web/src exists in i18n/en.ts, and every key in en.ts is
// used. "Used" means a string literal equal to the key, or a template literal whose static prefix
// (up to the first ${...}) is a dotted prefix of the key, such as `pets.species.${id}`.
// Comments are skipped, so a key that is only mentioned in a comment does not count.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const src = join(root, 'apps', 'web', 'src');
const catalogue = join(src, 'i18n', 'en.ts');

const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')
      ? [path]
      : [];
  });

/** Reads code from `i`; stops after the `}` that closes a template expression when `inTemplate`. */
function scanCode(text, i, inTemplate, out) {
  let depth = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      i = end < 0 ? text.length : end + 2;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      out.push({ quote: c, body: text.slice(i + 1, j), at: i });
      i = j + 1;
    } else if (c === '`') {
      i = scanTemplate(text, i + 1, out);
    } else {
      if (c === '{') depth++;
      else if (c === '}') {
        if (inTemplate && depth === 0) return i + 1;
        depth--;
      }
      i++;
    }
  }
  return i;
}

function scanTemplate(text, i, out) {
  const at = i - 1;
  let body = '';
  let prefix = null;
  while (i < text.length && text[i] !== '`') {
    if (text[i] === '\\') {
      body += text.slice(i, i + 2);
      i += 2;
    } else if (text[i] === '$' && text[i + 1] === '{') {
      prefix ??= body;
      i = scanCode(text, i + 2, true, out);
    } else {
      body += text[i++];
    }
  }
  out.push({ quote: '`', body, prefix, at });
  return i + 1;
}

const keys = new Set(
  [...readFileSync(catalogue, 'utf8').matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1]),
);

const exact = new Set();
const prefixes = new Set();
const called = []; // [file, key] for t('literal') calls, to report keys that do not exist

for (const file of sourceFiles(src)) {
  if (file === catalogue) continue;
  const text = readFileSync(file, 'utf8');
  const literals = [];
  scanCode(text, 0, false, literals);
  for (const { quote, body, prefix, at } of literals) {
    if (quote === '`') {
      if (prefix && /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)*\.$/.test(prefix)) prefixes.add(prefix);
      continue;
    }
    if (/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/.test(body)) exact.add(body);
    if (/\bt\(\s*$/.test(text.slice(Math.max(0, at - 6), at))) called.push([file, body]);
  }
}

const used = (key) => exact.has(key) || [...prefixes].some((p) => key.startsWith(p));
const missing = called.filter(([, key]) => !keys.has(key));
const unused = [...keys].filter((key) => !used(key));
const orphanPrefixes = [...prefixes].filter((p) => ![...keys].some((key) => key.startsWith(p)));

if (missing.length || unused.length) {
  for (const [file, key] of missing) console.error(`missing key ${key} (${relative(root, file)})`);
  for (const key of unused) console.error(`unused key ${key}`);
  console.error(`\ni18n check failed: ${missing.length} missing, ${unused.length} unused`);
  process.exit(1);
}
if (orphanPrefixes.length) {
  // A template such as `data.${x}` that is not a message at all is fine; list it for review only.
  console.log(`note: template prefixes with no keys: ${orphanPrefixes.join(', ')}`);
}
console.log(`i18n check passed: ${keys.size} keys, all used, none missing`);
