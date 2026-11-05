import { and, count, eq, sql } from 'drizzle-orm';
import type { Db } from '../db/connection';
import { households, memberships, scheduledNotifications, user } from '../db/schema';

export type Role = 'owner' | 'caretaker' | 'viewer';

export interface HouseholdSummary {
  id: string;
  name: string;
  role: Role;
  memberCount: number;
}

export interface Member {
  userId: string;
  name: string;
  image: string | null;
  role: Role;
  joinedAt: Date;
}

export function createHouseholdRepository(db: Db) {
  const memberCount = (householdId: unknown) =>
    sql<number>`(SELECT count(*)::int FROM memberships m WHERE m.household_id = ${householdId})`;

  return {
    async insert(row: { id: string; name: string; createdBy: string }): Promise<void> {
      await db.insert(households).values(row);
    },

    async get(id: string): Promise<{ id: string; name: string } | null> {
      const [row] = await db
        .select({ id: households.id, name: households.name })
        .from(households)
        .where(eq(households.id, id));
      return row ?? null;
    },

    async rename(id: string, name: string): Promise<void> {
      await db.update(households).set({ name }).where(eq(households.id, id));
    },

    /** Deletes the household; records, invites, change log and files rows go with it (FK cascade). */
    async delete(id: string): Promise<void> {
      await db.delete(households).where(eq(households.id, id));
    },

    async insertMembership(row: {
      householdId: string;
      userId: string;
      role: Role;
    }): Promise<void> {
      await db.insert(memberships).values(row);
    },

    /** Every (household, role) the user belongs to: the input of the membership cache. */
    async membershipsOf(userId: string): Promise<{ householdId: string; role: Role }[]> {
      const rows = await db
        .select({ householdId: memberships.householdId, role: memberships.role })
        .from(memberships)
        .where(eq(memberships.userId, userId));
      return rows.map((r) => ({ householdId: r.householdId, role: r.role as Role }));
    },

    /** One household as the user sees it, or null when they are not a member. */
    async summaryFor(householdId: string, userId: string): Promise<HouseholdSummary | null> {
      const [row] = await db
        .select({
          id: households.id,
          name: households.name,
          role: memberships.role,
          memberCount: memberCount(households.id),
        })
        .from(memberships)
        .innerJoin(households, eq(households.id, memberships.householdId))
        .where(and(eq(memberships.householdId, householdId), eq(memberships.userId, userId)));
      return row ? { ...row, role: row.role as Role } : null;
    },

    /** Households the user belongs to, with their role and the member count. */
    async listForUser(userId: string): Promise<HouseholdSummary[]> {
      const rows = await db
        .select({
          id: households.id,
          name: households.name,
          role: memberships.role,
          memberCount: memberCount(households.id),
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

    async listMembers(householdId: string): Promise<Member[]> {
      const rows = await db
        .select({
          userId: memberships.userId,
          name: user.name,
          image: user.image,
          role: memberships.role,
          joinedAt: memberships.joinedAt,
        })
        .from(memberships)
        .innerJoin(user, eq(user.id, memberships.userId))
        .where(eq(memberships.householdId, householdId))
        .orderBy(memberships.joinedAt, memberships.userId);
      return rows.map((r) => ({ ...r, role: r.role as Role }));
    },

    async findMember(householdId: string, userId: string): Promise<{ role: Role } | null> {
      const [row] = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.householdId, householdId), eq(memberships.userId, userId)));
      return row ? { role: row.role as Role } : null;
    },

    async memberCountOf(householdId: string): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(memberships)
        .where(eq(memberships.householdId, householdId));
      return row?.n ?? 0;
    },

    async setRole(householdId: string, userId: string, role: Role): Promise<void> {
      await db
        .update(memberships)
        .set({ role })
        .where(and(eq(memberships.householdId, householdId), eq(memberships.userId, userId)));
    },

    /** Removes the membership and the member's queued notifications for that household. */
    async removeMember(householdId: string, userId: string): Promise<void> {
      await db
        .delete(scheduledNotifications)
        .where(
          and(
            eq(scheduledNotifications.householdId, householdId),
            eq(scheduledNotifications.userId, userId),
          ),
        );
      await db
        .delete(memberships)
        .where(and(eq(memberships.householdId, householdId), eq(memberships.userId, userId)));
    },
  };
}
