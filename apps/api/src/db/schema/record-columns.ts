import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { check, integer, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { households } from './access';
import { tz } from './columns';

/** Columns every synced record table starts with (CON-petcare-002 DDL). */
export function recordColumns() {
  return {
    id: uuid('id').primaryKey(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    createdAt: timestamp('created_at', tz).notNull(),
    createdBy: text('created_by').notNull(),
    updatedAt: timestamp('updated_at', tz).notNull(),
    updatedBy: text('updated_by').notNull(),
    deletedAt: timestamp('deleted_at', tz),
  };
}

/** version >= 1 on every record table. */
export function versionCheck(table: string, version: AnyPgColumn) {
  return check(`${table}_version_check`, sql`${version} >= 1`);
}
