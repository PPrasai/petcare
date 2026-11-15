// `pnpm fingerprint` writes e2e/support/layout-fingerprint.json and layout-fingerprint.sha256 from
// the phone layout of the code as it is now (QA-45, SPEC-petcare-004 §5.8). It is run once, in the
// first commit of slice D1, against unchanged code. It builds and serves the app and the API through
// the Playwright config, then runs the capture test in write mode.
import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'npx playwright test e2e/phone-unchanged.spec.ts --project=chromium --reporter=list',
  { stdio: 'inherit', shell: true, env: { ...process.env, FINGERPRINT_WRITE: '1' } },
);
process.exit(result.status ?? 1);
