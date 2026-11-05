// pnpm verify: runs every gate in order, writes reports/verify-<date>.json (SPEC 5.4).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, globSync } from 'node:fs';

const hasE2e = globSync('e2e/**/*.spec.ts').length > 0;
const steps = [
  ['typecheck', 'pnpm typecheck'],
  ['lint', 'pnpm lint'],
  ['lint:deps', 'pnpm lint:deps'],
  ['lint:openapi', 'pnpm lint:openapi'],
  [
    'codegen-diff (CON-001 I-04)',
    'pnpm gen && git diff --exit-code -- packages/contracts/src/generated',
  ],
  ['contract-hashes', 'node scripts/check-contract-hashes.mjs'],
  ['repo-hygiene', 'node scripts/check-repo-hygiene.mjs'],
  ['runtime-deps', 'node scripts/check-deps.mjs'],
  ['test', 'pnpm test'],
  ['e2e', hasE2e ? 'pnpm e2e' : null],
  ['audit', 'pnpm audit --prod --audit-level high'],
];

const results = [];
let failed = false;
for (const [id, command] of steps) {
  if (command === null) {
    results.push({ id, command: 'pnpm e2e', result: 'skipped (no specs yet)', durationMs: 0 });
    continue;
  }
  const start = Date.now();
  console.log(`\n=== ${id}: ${command}`);
  const r = spawnSync(command, { stdio: 'inherit', shell: true });
  const ok = r.status === 0;
  results.push({ id, command, result: ok ? 'pass' : 'fail', durationMs: Date.now() - start });
  if (!ok) {
    failed = true;
    break;
  }
}

if (!existsSync('reports')) mkdirSync('reports');
const date = new Date().toISOString().slice(0, 10);
writeFileSync(
  `reports/verify-${date}.json`,
  JSON.stringify({ date, ok: !failed, results }, null, 2),
);
console.log(`\nverify ${failed ? 'FAILED' : 'passed'}`);
process.exit(failed ? 1 : 0);
