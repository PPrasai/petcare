import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tz } from './columns';
import { recordColumns, versionCheck } from './record-columns';

export const careRoutines = pgTable(
  'care_routines',
  {
    ...recordColumns(),
    petId: uuid('pet_id').notNull(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    schedule: jsonb('schedule').notNull(),
    active: boolean('active').notNull().default(true),
    note: text('note'),
  },
  (t) => [index('care_routines_pet_idx').on(t.petId), versionCheck('care_routines', t.version)],
);

export const careCompletions = pgTable(
  'care_completions',
  {
    ...recordColumns(),
    routineId: uuid('routine_id').notNull(),
    petId: uuid('pet_id').notNull(),
    occurrenceAt: timestamp('occurrence_at', tz).notNull(),
    completedAt: timestamp('completed_at', tz).notNull(),
    skipped: boolean('skipped').notNull().default(false),
    note: text('note'),
  },
  (t) => [
    index('care_completions_routine_idx').on(t.routineId, t.occurrenceAt),
    versionCheck('care_completions', t.version),
  ],
);

export const reminders = pgTable(
  'reminders',
  {
    ...recordColumns(),
    petId: uuid('pet_id'),
    title: text('title').notNull(),
    schedule: jsonb('schedule').notNull(),
    active: boolean('active').notNull().default(true),
    note: text('note'),
  },
  (t) => [index('reminders_household_idx').on(t.householdId), versionCheck('reminders', t.version)],
);

export const reminderCompletions = pgTable(
  'reminder_completions',
  {
    ...recordColumns(),
    reminderId: uuid('reminder_id').notNull(),
    occurrenceAt: timestamp('occurrence_at', tz).notNull(),
    completedAt: timestamp('completed_at', tz).notNull(),
  },
  (t) => [
    index('reminder_completions_idx').on(t.reminderId, t.occurrenceAt),
    versionCheck('reminder_completions', t.version),
  ],
);

export const reminderSnoozes = pgTable(
  'reminder_snoozes',
  {
    ...recordColumns(),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    occurrenceAt: timestamp('occurrence_at', tz).notNull(),
    snoozedUntil: timestamp('snoozed_until', tz).notNull(),
    userId: text('user_id').notNull(),
  },
  (t) => [
    index('reminder_snoozes_idx').on(t.sourceId, t.occurrenceAt, t.userId),
    versionCheck('reminder_snoozes', t.version),
  ],
);
