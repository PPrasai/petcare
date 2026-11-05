import { existsSync } from 'node:fs';
import { loadConfig } from '../config/env';
import { createDb } from '../db/connection';
import { createAuth } from '../infra/auth';

/**
 * Operator commands: `pnpm --filter @petcare/api cli <command>`.
 *   reset-link <email>   print a one-time password-reset URL (valid 30 minutes)
 * More commands (vapid, seed-envelope) are added by later slices.
 */
const USAGE = 'usage: cli reset-link <email>';

async function resetLink(email: string | undefined): Promise<number> {
  if (!email) {
    console.error(USAGE);
    return 2;
  }
  if (existsSync('.env')) process.loadEnvFile('.env');
  const config = loadConfig();
  const { db, pool } = createDb(config.databaseUrl);
  try {
    const auth = createAuth({ config, db, onUserCreated: async () => undefined });
    const url = await auth.createResetLink(email);
    if (!url) {
      console.error(`no account with email ${email}`);
      return 1;
    }
    // Printed to the terminal only; never logged.
    console.log(url);
    return 0;
  } finally {
    await pool.end();
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === 'reset-link') {
  process.exitCode = await resetLink(args[0]);
} else {
  console.error(USAGE);
  process.exitCode = 2;
}
