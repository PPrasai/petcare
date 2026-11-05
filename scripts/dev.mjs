// pnpm dev: start the dev stack, then API and web together.
import { spawn, spawnSync } from 'node:child_process';

spawnSync('docker', ['compose', '-f', 'compose.dev.yaml', 'up', '-d'], { stdio: 'inherit' });
const run = (args) => spawn('pnpm', args, { stdio: 'inherit', shell: true });
const procs = [run(['--filter', '@petcare/api', 'dev']), run(['--filter', '@petcare/web', 'dev'])];
process.on('SIGINT', () => procs.forEach((p) => p.kill()));
