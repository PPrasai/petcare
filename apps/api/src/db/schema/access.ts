import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { bytea, tz } from './columns';

export const households = pgTable(
  'households',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (t) => [check('households_name_check', sql`char_length(${t.name}) BETWEEN 1 AND 100`)],
);

export const memberships = pgTable(
  'memberships',
  {
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: text('role').notNull(),
    joinedAt: timestamp('joined_at', tz).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.householdId, t.userId] }),
    index('memberships_user_idx').on(t.userId),
    check('memberships_role_check', sql`${t.role} IN ('owner','caretaker','viewer')`),
  ],
);

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    tokenHash: bytea('token_hash').notNull().unique(),
    codeHash: bytea('code_hash').notNull().unique(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', tz).notNull(),
    usedAt: timestamp('used_at', tz),
    usedBy: text('used_by'),
    revokedAt: timestamp('revoked_at', tz),
  },
  (t) => [
    index('invites_household_idx').on(t.householdId),
    check('invites_role_check', sql`${t.role} IN ('caretaker','viewer')`),
  ],
);

export const userPreferences = pgTable(
  'user_preferences',
  {
    userId: text('user_id').primaryKey(),
    weightUnit: text('weight_unit').notNull().default('kg'),
    lengthUnit: text('length_unit').notNull().default('cm'),
    temperatureUnit: text('temperature_unit').notNull().default('c'),
    timeZone: text('time_zone').notNull().default('UTC'),
    dateFormat: text('date_format').notNull().default('iso'),
    currency: text('currency').notNull().default('USD'),
    theme: text('theme').notNull().default('system'),
    leadVaccinationMin: integer('lead_vaccination_min').notNull().default(10080),
    leadMedicationMin: integer('lead_medication_min').notNull().default(0),
    leadRoutineMin: integer('lead_routine_min').notNull().default(0),
    leadReminderMin: integer('lead_reminder_min').notNull().default(0),
    leadVetFollowupMin: integer('lead_vet_followup_min').notNull().default(1440),
    pushEnabled: boolean('push_enabled').notNull().default(true),
    pushTypes: text('push_types')
      .array()
      .notNull()
      .default(sql`ARRAY['vaccination','medication','careRoutine','reminder','vetVisit']`),
    updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
  },
  (t) => [
    check('user_preferences_weight_unit_check', sql`${t.weightUnit} IN ('kg','lb')`),
    check('user_preferences_length_unit_check', sql`${t.lengthUnit} IN ('cm','in')`),
    check('user_preferences_temperature_unit_check', sql`${t.temperatureUnit} IN ('c','f')`),
    check('user_preferences_date_format_check', sql`${t.dateFormat} IN ('iso','dmy','mdy')`),
    check('user_preferences_currency_check', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    check('user_preferences_theme_check', sql`${t.theme} IN ('system','light','dark')`),
    check(
      'user_preferences_lead_vaccination_min_check',
      sql`${t.leadVaccinationMin} BETWEEN 0 AND 43200`,
    ),
    check(
      'user_preferences_lead_medication_min_check',
      sql`${t.leadMedicationMin} BETWEEN 0 AND 1440`,
    ),
    check('user_preferences_lead_routine_min_check', sql`${t.leadRoutineMin} BETWEEN 0 AND 1440`),
    check(
      'user_preferences_lead_reminder_min_check',
      sql`${t.leadReminderMin} BETWEEN 0 AND 43200`,
    ),
    check(
      'user_preferences_lead_vet_followup_min_check',
      sql`${t.leadVetFollowupMin} BETWEEN 0 AND 43200`,
    ),
  ],
);
