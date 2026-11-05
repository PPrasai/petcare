// Fails if harness/planning/secret files are tracked (SPEC 5.1, 6).
import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const forbidden =
  /^(\.aeom\/|PROJECT-INPUT\.md$|\.claude\/|CLAUDE\.md$|AGENTS\.md$|reports\/|test-results\/|playwright-report\/|\.env(\.|$))/;
const bad = files.filter((f) => forbidden.test(f) && f !== '.env.example');
if (bad.length) {
  console.error('tracked files that must never be committed:\n' + bad.join('\n'));
  process.exit(1);
}
console.log('repo hygiene ok');
