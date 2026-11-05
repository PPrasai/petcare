import { count, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/connection';
import { households, memberships } from '../db/schema';

export type Role = 'owner' | 'caretaker' | 'viewer';

export interface HouseholdSummary {
  id: string;
  name: string;
  role: Role;
  memberCount: number;
}

export function createHouseholdRepository(db: Db) {
  return {
    async insert(row: { id: string; name: string; createdBy: string }): Promise<void> {
      await db.insert(households).values(row);
    },

    async insertMembership(row: {
      householdId: string;
      userId: string;
      role: Role;
    }): Promise<void> {
      await db.insert(memberships).values(row);
    },

    /** Households the user belongs to, with their role and the member count. */
    async listForUser(userId: string): Promise<HouseholdSummary[]> {
      const rows = await db
        .select({
          id: households.id,
          name: households.name,
          role: memberships.role,
          memberCount: sql<number>`(SELECT count(*)::int FROM memberships m WHERE m.household_id = ${households.id})`,
        })
        .from(memberships)
        .innerJoin(households, eq(households.id, memberships.householdId))
        .where(eq(memberships.userId, userId))
        .orderBy(households.createdAt);
      return rows.map((r) => ({ ...r, role: r.role as Role }));
    },

    async countMemberships(userId: string): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(memberships)
        .where(eq(memberships.userId, userId));
      return row?.n ?? 0;
    },
  };
}
