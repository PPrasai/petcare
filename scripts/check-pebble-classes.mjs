#!/usr/bin/env node
// QA-41: no Tailwind utility layout classes in converted files (SPEC-petcare-003 §6.1).
// Scans the className string and template literals of apps/web/src/features/**/*.tsx and
// apps/web/src/app/router.tsx. A file that still has matches must be listed in
// scripts/pebble-legacy-allow.json. The list may only shrink: a listed file with no matches fails,
// and so does a file with matches that is not listed.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const web = join(root, 'apps', 'web', 'src');
const allowPath = join(root, 'scripts', 'pebble-legacy-allow.json');

// The regex of SPEC-petcare-003 §6.1. `print:hidden` is not in it, so it stays allowed.
export const LAYOUT_CLASS =
  /\b(rounded(-\w+)?|p[xytrbl]?-\d|m[xytrbl]?-\d|gap-\d|space-[xy]-\d|text-(xs|sm|base|lg|xl|\dxl)|font-(semibold|bold|medium)|grid-cols-\d|flex-(col|row|wrap)|items-\w+|justify-\w+|max-w-\w+|w-\d+|h-\d+|border(-\w+)?|bg-white|text-white|text-black|shadow(-\w+)?)\b/;

const tsxFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith('.tsx') && !/\.test\.tsx$/.test(name) ? [path] : [];
  });

/** Reads a quoted or template literal starting at `i`; returns its body and the next index. */
function literal(text, i) {
  const quote = text[i];
  let j = i + 1;
  while (j < text.length && text[j] !== quote) j += text[j] === '\\' ? 2 : 1;
  return { body: text.slice(i + 1, j), end: j + 1 };
}

/** Every string and template literal inside text[from, to). */
function literalsIn(text, from, to) {
  const out = [];
  for (let i = from; i < to;) {
    const c = text[i];
    if (c === "'" || c === '"' || c === '`') {
      const lit = literal(text, i);
      out.push(lit.body);
      i = lit.end;
    } else i++;
  }
  return out;
}

/** The class strings of every `className=` attribute in a source file. */
export function classStrings(text) {
  const out = [];
  for (const m of text.matchAll(/className\s*=\s*/g)) {
    const start = m.index + m[0].length;
    const c = text[start];
    if (c === '"' || c === "'") out.push(literal(text, start).body);
    else if (c === '{') {
      let depth = 0;
      let i = start;
      for (; i < text.length; i++) {
        const ch = text[i];
        if (ch === "'" || ch === '"' || ch === '`') {
          i = literal(text, i).end - 1;
        } else if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) break;
      }
      out.push(...literalsIn(text, start + 1, i));
    }
  }
  return out;
}

const files = [...tsxFiles(join(web, 'features')), join(web, 'app', 'router.tsx')];
const hits = new Map();
for (const file of files) {
  const found = classStrings(readFileSync(file, 'utf8')).filter((s) => LAYOUT_CLASS.test(s));
  if (found.length > 0) hits.set(relative(web, file).replaceAll('\\', '/'), found);
}

const allowed = existsSync(allowPath) ? JSON.parse(readFileSync(allowPath, 'utf8')) : [];
const problems = [];
for (const [file, found] of hits) {
  if (!allowed.includes(file)) {
    problems.push(`${file}: utility layout classes in a converted file: ${found.join(' | ')}`);
  }
}
for (const file of allowed) {
  if (!hits.has(file)) {
    problems.push(
      `${file}: listed in scripts/pebble-legacy-allow.json but has no matches (remove it)`,
    );
  }
}
if (problems.length > 0) {
  console.error(`QA-41 failed:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(
  `pebble classes ok: ${files.length - hits.size} converted files, ${hits.size} still listed`,
);
