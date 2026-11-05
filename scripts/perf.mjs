// QA-01: seeds the envelope into throwaway containers and load-tests the real API.
// Needs Docker. Writes reports/perf-<date>.json and exits non-zero on a budget breach.
import { spawnSync } from 'node:child_process';

const result = spawnSync('pnpm', ['--filter', '@petcare/api', 'perf'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS ?? '' },
});
process.exit(result.status ?? 1);
