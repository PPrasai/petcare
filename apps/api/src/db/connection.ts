import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = ReturnType<typeof createDb>['db'];

/** One pg pool plus the Drizzle handle over it. */
export function createDb(databaseUrl: string) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  // An idle client error must not crash the process; the next query reports it.
  pool.on('error', () => undefined);
  const db = drizzle(pool, { schema });
  return { db, pool };
}
