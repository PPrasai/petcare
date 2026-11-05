import { and, eq, isNull, or } from 'drizzle-orm';
import type { Db } from '../db/connection';
import { households, invites } from '../db/schema';

export interface InviteRow {
  id: string;
  householdId: string;
  role: 'caretaker' | 'viewer';
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

const columns = {
  id: invites.id,
  householdId: invites.householdId,
  role: invites.role,
  createdAt: invites.createdAt,
  expiresAt: invites.expiresAt,
  usedAt: invites.usedAt,
  revokedAt: invites.revokedAt,
};

type Selected = Omit<InviteRow, 'role'> & { role: string };
const toRow = (r: Selected): InviteRow => ({ ...r, role: r.role as InviteRow['role'] });

export function createInviteRepository(db: Db) {
  return {
    async insert(row: {
      id: string;
      householdId: string;
      role: 'caretaker' | 'viewer';
      tokenHash: Buffer;
      codeHash: Buffer;
      createdBy: string;
      expiresAt: Date;
    }): Promise<InviteRow> {
      const [created] = await db.insert(invites).values(row).returning(columns);
      if (!created) throw new Error('invite insert returned no row');
      return toRow(created);
    },

    async listForHousehold(householdId: string): Promise<InviteRow[]> {
      const rows = await db
        .select(columns)
        .from(invites)
        .where(eq(invites.householdId, householdId))
        .orderBy(invites.createdAt);
      return rows.map(toRow);
    },

    async findInHousehold(householdId: string, inviteId: string): Promise<InviteRow | null> {
      const [row] = await db
        .select(columns)
        .from(invites)
        .where(and(eq(invites.householdId, householdId), eq(invites.id, inviteId)));
      return row ? toRow(row) : null;
    },

    /** The invite matching a link-token hash or a code hash, plus its household's name. */
    async findBySecret(
      secret: { tokenHash: Buffer } | { codeHash: Buffer },
    ): Promise<(InviteRow & { householdName: string }) | null> {
      const match =
        'tokenHash' in secret
          ? eq(invites.tokenHash, secret.tokenHash)
          : eq(invites.codeHash, secret.codeHash);
      const [row] = await db
        .select({ ...columns, householdName: households.name })
        .from(invites)
        .innerJoin(households, eq(households.id, invites.householdId))
        .where(match);
      return row ? { ...toRow(row), householdName: row.householdName } : null;
    },

    /** Marks an open invite used. Returns false if someone else used or revoked it first. */
    async markUsed(inviteId: string, userId: string, now: Date): Promise<boolean> {
      const updated = await db
        .update(invites)
        .set({ usedAt: now, usedBy: userId })
        .where(and(eq(invites.id, inviteId), isNull(invites.usedAt), isNull(invites.revokedAt)))
        .returning({ id: invites.id });
      return updated.length === 1;
    },

    async revoke(inviteId: string, now: Date): Promise<void> {
      await db
        .update(invites)
        .set({ revokedAt: now })
        .where(
          and(eq(invites.id, inviteId), isNull(invites.usedAt), or(isNull(invites.revokedAt))),
        );
    },
  };
}
