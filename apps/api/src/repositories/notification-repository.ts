import { and, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { RecordType } from '@petcare/domain';
import type { Db } from '../db/connection';
import { calendarTokens, pushSubscriptions, scheduledNotifications } from '../db/schema';
import { columnsOf, recordTables } from './sync-registry';
import type { RecordRow } from './record-repository';

export type SubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type ScheduledRow = typeof scheduledNotifications.$inferSelect;
export type NewScheduled = Omit<ScheduledRow, 'sentAt' | 'attempts'>;

/** Where a completed (done or skipped) occurrence is recorded, per source type. */
const COMPLETION: Record<string, { type: RecordType; sourceColumn: string }> = {
  medication: { type: 'medicationDose', sourceColumn: 'medicationId' },
  careRoutine: { type: 'careCompletion', sourceColumn: 'routineId' },
  reminder: { type: 'reminderCompletion', sourceColumn: 'reminderId' },
};

/** Push subscriptions, scheduled notifications and calendar tokens. */
export function createNotificationRepository(db: Db) {
  const col = (type: RecordType, name: string) => {
    const column = columnsOf(type).all[name];
    if (!column) throw new Error(`${type} has no column ${name}`);
    return column;
  };

  return {
    // ---------------------------------------------------------------- subscriptions
    /** Registers a device. The endpoint is unique: a known endpoint is re-bound to this user. */
    async upsertSubscription(row: {
      id: string;
      userId: string;
      endpoint: string;
      p256dh: string;
      auth: string;
      userAgent: string | null;
    }): Promise<void> {
      await db
        .insert(pushSubscriptions)
        .values(row)
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            userId: row.userId,
            p256dh: row.p256dh,
            auth: row.auth,
            userAgent: row.userAgent,
          },
        });
    },

    async subscriptionsOf(userId: string): Promise<SubscriptionRow[]> {
      return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    },

    /** Removes the caller's own subscription; an endpoint that belongs to someone else is untouched. */
    async deleteSubscription(userId: string, endpoint: string): Promise<void> {
      await db
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
    },

    async deleteSubscriptionByEndpoint(endpoint: string): Promise<void> {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    },

    async markSubscriptionSuccess(endpoint: string, at: Date): Promise<void> {
      await db
        .update(pushSubscriptions)
        .set({ lastSuccessAt: at })
        .where(eq(pushSubscriptions.endpoint, endpoint));
    },

    // ---------------------------------------------------------------- scheduled notifications
    /** Inserts rows; an existing unsent row for the same occurrence has its time and text updated. */
    async upsertScheduled(rows: NewScheduled[]): Promise<void> {
      if (rows.length === 0) return;
      await db
        .insert(scheduledNotifications)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            scheduledNotifications.userId,
            scheduledNotifications.sourceType,
            scheduledNotifications.sourceId,
            scheduledNotifications.occurrenceAt,
          ],
          set: {
            fireAt: sql`excluded.fire_at`,
            title: sql`excluded.title`,
            body: sql`excluded.body`,
            householdId: sql`excluded.household_id`,
          },
          setWhere: isNull(scheduledNotifications.sentAt),
        });
    },

    async unsentForSource(sourceType: string, sourceId: string): Promise<ScheduledRow[]> {
      return db
        .select()
        .from(scheduledNotifications)
        .where(
          and(
            eq(scheduledNotifications.sourceType, sourceType),
            eq(scheduledNotifications.sourceId, sourceId),
            isNull(scheduledNotifications.sentAt),
          ),
        );
    },

    async deleteScheduled(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      await db.delete(scheduledNotifications).where(inArray(scheduledNotifications.id, ids));
    },

    /** Due, unsent rows; other dispatchers skip rows this transaction has locked. */
    async claimDue(now: Date, limit: number): Promise<ScheduledRow[]> {
      return db
        .select()
        .from(scheduledNotifications)
        .where(and(isNull(scheduledNotifications.sentAt), lte(scheduledNotifications.fireAt, now)))
        .orderBy(scheduledNotifications.fireAt)
        .limit(limit)
        .for('update', { skipLocked: true });
    },

    async markSent(id: string, at: Date): Promise<void> {
      await db
        .update(scheduledNotifications)
        .set({ sentAt: at, attempts: sql`${scheduledNotifications.attempts} + 1` })
        .where(eq(scheduledNotifications.id, id));
    },

    async bumpAttempts(id: string): Promise<number> {
      const [row] = await db
        .update(scheduledNotifications)
        .set({ attempts: sql`${scheduledNotifications.attempts} + 1` })
        .where(eq(scheduledNotifications.id, id))
        .returning({ attempts: scheduledNotifications.attempts });
      return row?.attempts ?? 0;
    },

    /** Scheduled rows of a user, for tests and diagnostics. */
    async scheduledOf(userId: string): Promise<ScheduledRow[]> {
      return db
        .select()
        .from(scheduledNotifications)
        .where(eq(scheduledNotifications.userId, userId))
        .orderBy(scheduledNotifications.fireAt);
    },

    // ---------------------------------------------------------------- is it still worth sending?
    /** Whether a dose or completion (done or skipped) exists for this occurrence. */
    async isCompleted(sourceType: string, sourceId: string, occurrenceAt: Date): Promise<boolean> {
      const target = COMPLETION[sourceType];
      if (!target) return false;
      const table = recordTables[target.type];
      if (!table) return false;
      const rows = await db
        .select({ id: col(target.type, 'id') })
        .from(table)
        .where(
          and(
            eq(col(target.type, target.sourceColumn), sourceId),
            eq(col(target.type, 'occurrenceAt'), occurrenceAt),
            isNull(col(target.type, 'deletedAt')),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    /** The latest time this user snoozed the occurrence until, or null. */
    async snoozedUntil(
      userId: string,
      sourceType: string,
      sourceId: string,
      occurrenceAt: Date,
    ): Promise<Date | null> {
      const table = recordTables.reminderSnooze;
      if (!table) return null;
      const until = col('reminderSnooze', 'snoozedUntil');
      const [row] = await db
        .select({ latest: sql<Date | null>`max(${until})` })
        .from(table)
        .where(
          and(
            eq(col('reminderSnooze', 'userId'), userId),
            eq(col('reminderSnooze', 'sourceType'), sourceType),
            eq(col('reminderSnooze', 'sourceId'), sourceId),
            eq(col('reminderSnooze', 'occurrenceAt'), occurrenceAt),
            isNull(col('reminderSnooze', 'deletedAt')),
          ),
        );
      return row?.latest ? new Date(row.latest) : null;
    },

    /** Whether a later vaccination of the same pet and name exists (it answers this due date). */
    async isVaccinationSuperseded(vaccinationId: string): Promise<boolean> {
      const table = recordTables.vaccination;
      if (!table) return false;
      const [self] = await db
        .select()
        .from(table)
        .where(eq(col('vaccination', 'id'), vaccinationId));
      const row = self as RecordRow | undefined;
      if (!row) return false;
      const rows = await db
        .select({ id: col('vaccination', 'id') })
        .from(table)
        .where(
          and(
            eq(col('vaccination', 'petId'), row.petId as string),
            sql`lower(trim(${col('vaccination', 'vaccineName')})) = lower(trim(${row.vaccineName as string}))`,
            sql`${col('vaccination', 'givenOn')} > ${row.givenOn as string}`,
            isNull(col('vaccination', 'deletedAt')),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    /** Live records of one type in the given households (null = every household). */
    async liveRecords(type: RecordType, householdIds: string[] | null): Promise<RecordRow[]> {
      const table = recordTables[type];
      if (!table || householdIds?.length === 0) return [];
      const live = isNull(col(type, 'deletedAt'));
      const rows = await db
        .select()
        .from(table)
        .where(householdIds ? and(inArray(col(type, 'householdId'), householdIds), live) : live);
      return rows as RecordRow[];
    },

    // ---------------------------------------------------------------- calendar tokens
    async calendarOf(userId: string): Promise<{ createdAt: Date } | null> {
      const [row] = await db
        .select({ createdAt: calendarTokens.createdAt })
        .from(calendarTokens)
        .where(eq(calendarTokens.userId, userId));
      return row ?? null;
    },

    /** Stores the hash of a new token, replacing the old one (which stops working). */
    async replaceCalendarToken(userId: string, tokenHash: Buffer): Promise<Date> {
      const values = { tokenHash, createdAt: new Date() };
      const [row] = await db
        .insert(calendarTokens)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: calendarTokens.userId, set: values })
        .returning({ createdAt: calendarTokens.createdAt });
      return row?.createdAt ?? values.createdAt;
    },

    async deleteCalendarToken(userId: string): Promise<void> {
      await db.delete(calendarTokens).where(eq(calendarTokens.userId, userId));
    },

    async userOfCalendarToken(tokenHash: Buffer): Promise<string | null> {
      const [row] = await db
        .select({ userId: calendarTokens.userId })
        .from(calendarTokens)
        .where(eq(calendarTokens.tokenHash, tokenHash));
      return row?.userId ?? null;
    },
  };
}
