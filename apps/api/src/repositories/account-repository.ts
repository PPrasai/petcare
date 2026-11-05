import { eq } from 'drizzle-orm';
import type { Db } from '../db/connection';
import {
  account,
  calendarTokens,
  pushSubscriptions,
  scheduledNotifications,
  user,
  userPreferences,
} from '../db/schema';

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

/** Views over Better Auth's tables (it writes them), and the one delete that removes a user. */
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

    /**
     * Removes the user and what only they own: preferences, push subscriptions, calendar token and
     * queued notifications. Sessions and linked accounts go with the user row (FK cascade).
     * Memberships and households are handled by the caller first.
     */
    async deleteUser(userId: string): Promise<void> {
      await db.delete(scheduledNotifications).where(eq(scheduledNotifications.userId, userId));
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
      await db.delete(calendarTokens).where(eq(calendarTokens.userId, userId));
      await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
      await db.delete(user).where(eq(user.id, userId));
    },
  };
}
