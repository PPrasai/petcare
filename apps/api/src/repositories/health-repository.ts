import { sql } from 'drizzle-orm';
import type { Db } from '../db/connection';

export function createHealthRepository(db: Db) {
  return {
    /** True when Postgres answers a trivial query. */
    async pingDatabase(): Promise<boolean> {
      try {
        await db.execute(sql`SELECT 1`);
        return true;
      } catch {
        return false;
      }
    },
  };
}
