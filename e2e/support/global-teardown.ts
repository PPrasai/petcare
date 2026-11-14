import { existsSync, readFileSync, rmSync } from 'node:fs';
import { VIOLATION_LOG } from './no-v2-writes';

/** Fails the run if any page pushed a CON-003-only shape (see no-v2-writes.ts). */
export default function globalTeardown(): void {
  if (!existsSync(VIOLATION_LOG)) return;
  const text = readFileSync(VIOLATION_LOG, 'utf8').trim();
  rmSync(VIOLATION_LOG);
  throw new Error(`R-2: the UI pushed CON-003-only shapes before slice P6/P7:\n${text}`);
}
