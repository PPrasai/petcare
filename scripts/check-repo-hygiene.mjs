// Fails if harness/planning/secret files are tracked (SPEC 5.1, 6).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const forbidden =
  /^(\.aeom\/|PROJECT-INPUT\.md$|\.claude\/|CLAUDE\.md$|AGENTS\.md$|reports\/|test-results\/|playwright-report\/|\.env(\.|$))/;
const bad = files.filter((f) => forbidden.test(f) && f !== '.env.example');
if (bad.length) {
  console.error('tracked files that must never be committed:\n' + bad.join('\n'));
  process.exit(1);
}

// QA-45: the phone fingerprint is captured once, before slice D1 changes anything, and never
// regenerated inside a D slice (SPEC-petcare-004 §5.8, §6). Its hash is kept beside it.
const fingerprint = 'e2e/support/layout-fingerprint.json';
const recorded = 'e2e/support/layout-fingerprint.sha256';
if (existsSync(fingerprint) || existsSync(recorded)) {
  const actual = createHash('sha256').update(readFileSync(fingerprint)).digest('hex');
  const expected = readFileSync(recorded, 'utf8').trim();
  if (actual !== expected) {
    console.error(
      `${fingerprint} does not match ${recorded} (QA-45): the phone fingerprint must not be regenerated`,
    );
    process.exit(1);
  }
}
console.log('repo hygiene ok');
