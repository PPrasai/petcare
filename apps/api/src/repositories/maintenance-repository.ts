import { getTableColumns, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { getEntity } from '@petcare/domain';
import type { RecordType } from '@petcare/domain';
import type { Db } from '../db/connection';
import { recordTables } from './sync-registry';
import { CHANGE_LOG_LOCK_KEY } from './sync-repository';

const types = (): RecordType[] => Object.keys(recordTables) as RecordType[];
/** Scheduled clean-up (AS section 4.8, SPEC section 5.6): the queries behind the purge job. */
export function createMaintenanceRepository(db: Db) {
  /** `table.column` as SQL, quoted by Drizzle. */
  const col = (column: PgColumn): SQL => sql`${column}`;

  return {
    /**
     * Drops change-log rows and tombstones older than `cutoff`. A live record whose newest
     * change-log row is older than `cutoff` first gets a fresh row, so a full re-pull still
     * finds it after the old rows are gone. Takes the change-log lock like a push does.
     * Returns the number of tombstones and change-log rows removed.
     */
    async purgeHistory(cutoff: Date): Promise<{ tombstones: number; changeLogRows: number }> {
      return db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${CHANGE_LOG_LOCK_KEY})`);
        let tombstones = 0;
        for (const type of types()) {
          const table = recordTables[type] as PgTable;
          const columns = getTableColumns(table) as Record<string, PgColumn>;
          const [id, deletedAt, householdId, version] = [
            columns.id,
            columns.deletedAt,
            columns.householdId,
            columns.version,
          ].map((c) => col(c as PgColumn)) as [SQL, SQL, SQL, SQL];
          // Live records that would lose their only history: write one fresh row for each.
          await tx.execute(sql`
            INSERT INTO change_log (household_id, record_type, record_id, version, op, changed_fields, actor)
            SELECT ${householdId}, ${type}, ${id}, ${version}, 'update', ARRAY[]::text[], 'system'
              FROM ${table}
             WHERE ${deletedAt} IS NULL
               AND (SELECT max(c.at) FROM change_log c
                     WHERE c.record_type = ${type} AND c.record_id = ${id}) < ${cutoff}`);
          // Tombstones past the horizon, with their history.
          await tx.execute(sql`
            DELETE FROM change_log
             WHERE record_type = ${type}
               AND record_id IN (SELECT ${id} FROM ${table} WHERE ${deletedAt} < ${cutoff})`);
          const removed = await tx.execute(
            sql`DELETE FROM ${table} WHERE ${deletedAt} < ${cutoff}`,
          );
          tombstones += removed.rowCount ?? 0;
        }
        const old = await tx.execute(sql`DELETE FROM change_log WHERE at < ${cutoff}`);
        return { tombstones, changeLogRows: old.rowCount ?? 0 };
      });
    },

    /** Sent notifications older than `cutoff`. */
    async purgeSentNotifications(cutoff: Date): Promise<number> {
      const result = await db.execute(
        sql`DELETE FROM scheduled_notifications WHERE sent_at < ${cutoff}`,
      );
      return result.rowCount ?? 0;
    },

    /**
     * Files created before `cutoff` that no live record references (by any of the entities'
     * `fileRefs`), plus files already marked deleted. Returns what to remove from disk.
     */
    async findUnreferencedFiles(cutoff: Date): Promise<{ id: string; householdId: string }[]> {
      const references: SQL[] = [];
      for (const type of types()) {
        const entity = getEntity(type);
        const table = recordTables[type] as PgTable;
        const columns = getTableColumns(table) as Record<string, PgColumn>;
        for (const ref of entity.fileRefs) {
          const column = columns[ref];
          if (!column) throw new Error(`${type}.${ref} is not a column`);
          const deleted = col(columns.deletedAt as PgColumn);
          references.push(
            column.columnType === 'PgArray'
              ? sql`EXISTS (SELECT 1 FROM ${table} WHERE ${deleted} IS NULL AND f.id = ANY(${col(column)}))`
              : sql`EXISTS (SELECT 1 FROM ${table} WHERE ${deleted} IS NULL AND ${col(column)} = f.id)`,
          );
        }
      }
      const referenced = references.length > 0 ? sql.join(references, sql` OR `) : sql`false`;
      const result = await db.execute(sql`
        SELECT f.id, f.household_id AS "householdId" FROM file_objects f
         WHERE f.created_at < ${cutoff}
           AND (f.deleted_at IS NOT NULL OR NOT (${referenced}))`);
      return result.rows as { id: string; householdId: string }[];
    },

    async deleteFileRows(ids: string[]): Promise<void> {
      if (ids.length === 0) return;
      await db.execute(
        sql`DELETE FROM file_objects WHERE id IN (${sql.join(
          ids.map((i) => sql`${i}::uuid`),
          sql`, `,
        )})`,
      );
    },
  };
}
