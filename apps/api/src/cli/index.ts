import { existsSync } from 'node:fs';
import { loadConfig } from '../config/env';
import { createDb } from '../db/connection';
import { createAuth } from '../infra/auth';
import { generateVapidKeys } from '../infra/push-sender';

/**
 * Operator commands: `pnpm --filter @petcare/api cli <command>`.
 *   reset-link <email>   print a one-time password-reset URL (valid 30 minutes)
 *   vapid                print a new VAPID key pair as .env lines (web push)
 *   seed-envelope        fill an empty, migrated database with the QA-01 envelope
 */
const USAGE = 'usage: cli reset-link <email> | cli vapid | cli seed-envelope';

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

async function seed(): Promise<number> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const { seedEnvelope } = await import('./seed-envelope');
  const started = Date.now();
  const seeded = await seedEnvelope(loadConfig().databaseUrl);
  console.log(
    `seeded ${seeded.userIds.length} users and ${seeded.householdIds.length} households in ${Date.now() - started} ms`,
  );
  return 0;
}

const [command, ...args] = process.argv.slice(2);
if (command === 'reset-link') {
  process.exitCode = await resetLink(args[0]);
} else if (command === 'seed-envelope') {
  process.exitCode = await seed();
} else if (command === 'vapid') {
  const keys = generateVapidKeys();
  console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
  console.log('VAPID_SUBJECT=mailto:you@example.com');
} else {
  console.error(USAGE);
  process.exitCode = 2;
}
