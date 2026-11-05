import { sql } from 'drizzle-orm';
import {
  bigserial,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { households } from './access';
import { tz } from './columns';

export const changeLog = pgTable(
  'change_log',
  {
    seq: bigserial('seq', { mode: 'number' }).primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    recordType: text('record_type').notNull(),
    recordId: uuid('record_id').notNull(),
    version: integer('version').notNull(),
    op: text('op').notNull(),
    changedFields: text('changed_fields').array().notNull(),
    actor: text('actor').notNull(),
    at: timestamp('at', tz).notNull().defaultNow(),
  },
  (t) => [
    index('change_log_household_seq_idx').on(t.householdId, t.seq),
    index('change_log_record_idx').on(t.recordId, t.version),
    check('change_log_op_check', sql`${t.op} IN ('create','update','delete')`),
  ],
);

export const syncMutations = pgTable('sync_mutations', {
  mutationId: uuid('mutation_id').primaryKey(),
  userId: text('user_id').notNull(),
  /** The exact PushResult returned the first time. */
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', tz).notNull().defaultNow(),
});

export const conflicts = pgTable(
  'conflicts',
  {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    recordType: text('record_type').notNull(),
    recordId: uuid('record_id').notNull(),
    /** null when a whole update was rejected (delete wins). */
    field: text('field'),
    keptValue: jsonb('kept_value'),
    replacedValue: jsonb('replaced_value'),
    /** User whose value lost. */
    replacedBy: text('replaced_by').notNull(),
    winningBy: text('winning_by').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', tz).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', tz),
    resolvedBy: text('resolved_by'),
  },
  (t) => [
    index('conflicts_household_idx')
      .on(t.householdId, t.createdAt)
      .where(sql`${t.resolvedAt} IS NULL`),
    check(
      'conflicts_reason_check',
      sql`${t.reason} IN ('concurrentFieldEdit','updateAfterDelete')`,
    ),
  ],
);
