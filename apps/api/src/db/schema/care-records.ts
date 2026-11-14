import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
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
    // CON-petcare-003: nullable, no default (expand-only).
    category: text('category'),
    audienceUserId: text('audience_user_id'),
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

// CON-petcare-003: everyday care logs (appendOnly) and meal presets (mergeable).
export const careLogs = pgTable(
  'care_logs',
  {
    ...recordColumns(),
    petId: uuid('pet_id').notNull(),
    kind: text('kind').notNull(),
    occurredAt: timestamp('occurred_at', tz).notNull(),
    note: text('note'),
    foodName: text('food_name'),
    quantity: numeric('quantity', { precision: 12, scale: 4, mode: 'number' }),
    quantityUnit: text('quantity_unit'),
    durationMin: integer('duration_min'),
    groomingTasks: text('grooming_tasks')
      .array()
      .notNull()
      .default(sql`'{}'`),
    medicationName: text('medication_name'),
    medicationId: uuid('medication_id'),
    route: text('route'),
    doseText: text('dose_text'),
  },
  (t) => [
    index('care_logs_pet_idx').on(t.petId, t.occurredAt),
    versionCheck('care_logs', t.version),
    check('care_logs_quantity_check', sql`${t.quantity} > 0`),
    check('care_logs_duration_min_check', sql`${t.durationMin} BETWEEN 1 AND 1440`),
  ],
);

export const mealPresets = pgTable(
  'meal_presets',
  {
    ...recordColumns(),
    petId: uuid('pet_id').notNull(),
    foodName: text('food_name').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 4, mode: 'number' }).notNull(),
    quantityUnit: text('quantity_unit').notNull(),
  },
  (t) => [
    index('meal_presets_pet_idx').on(t.petId),
    versionCheck('meal_presets', t.version),
    check('meal_presets_quantity_check', sql`${t.quantity} > 0`),
  ],
);
