// Installs the commit-msg hook (rejects AI-attribution trailers). Runs from `prepare`.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (existsSync('.git')) {
  spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
}
