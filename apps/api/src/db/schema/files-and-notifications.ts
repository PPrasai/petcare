import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { households } from './access';
import { bytea, tz } from './columns';

export const fileObjects = pgTable(
  'file_objects',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: bytea('sha256').notNull(),
    /** Display only; never used in paths; max 200 chars enforced in the service. */
    originalName: text('original_name'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', tz),
  },
  (t) => [
    index('file_objects_household_idx')
      .on(t.householdId)
      .where(sql`${t.deletedAt} IS NULL`),
    check(
      'file_objects_mime_type_check',
      sql`${t.mimeType} IN ('image/jpeg','image/png','image/webp','image/heic','application/pdf')`,
    ),
    check('file_objects_size_bytes_check', sql`${t.sizeBytes} > 0 AND ${t.sizeBytes} <= 10485760`),
  ],
);

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey(),
    userId: text('user_id').notNull(),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    lastSuccessAt: timestamp('last_success_at', tz),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
);

export const scheduledNotifications = pgTable(
  'scheduled_notifications',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    occurrenceAt: timestamp('occurrence_at', tz).notNull(),
    fireAt: timestamp('fire_at', tz).notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    sentAt: timestamp('sent_at', tz),
    attempts: integer('attempts').notNull().default(0),
  },
  (t) => [
    unique('scheduled_notifications_dedupe').on(t.userId, t.sourceType, t.sourceId, t.occurrenceAt),
    index('scheduled_notifications_due_idx')
      .on(t.fireAt)
      .where(sql`${t.sentAt} IS NULL`),
    index('scheduled_notifications_source_idx').on(t.sourceId),
    check(
      'scheduled_notifications_source_type_check',
      sql`${t.sourceType} IN ('vaccination','medication','careRoutine','reminder','vetVisit')`,
    ),
  ],
);

export const calendarTokens = pgTable('calendar_tokens', {
  userId: text('user_id').primaryKey(),
  tokenHash: bytea('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', tz).notNull().defaultNow(),
});
