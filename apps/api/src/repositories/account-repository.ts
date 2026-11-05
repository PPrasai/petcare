import { eq } from 'drizzle-orm';
import type { Db } from '../db/connection';
import { account, user } from '../db/schema';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  image: string | null;
}

export interface LinkedAccounts {
  /** Provider ids other than the email+password "credential" account. */
  providers: string[];
  hasPassword: boolean;
}

/** Read-only views over Better Auth's tables. Better Auth itself writes them. */
export function createAccountRepository(db: Db) {
  return {
    async findUser(userId: string): Promise<UserRow | null> {
      const [row] = await db
        .select({ id: user.id, email: user.email, name: user.name, image: user.image })
        .from(user)
        .where(eq(user.id, userId));
      return row ?? null;
    },

    async linkedAccounts(userId: string): Promise<LinkedAccounts> {
      const rows = await db
        .select({ providerId: account.providerId, password: account.password })
        .from(account)
        .where(eq(account.userId, userId));
      return {
        providers: rows.filter((r) => r.providerId !== 'credential').map((r) => r.providerId),
        hasPassword: rows.some((r) => r.providerId === 'credential' && r.password !== null),
      };
    },
  };
}
