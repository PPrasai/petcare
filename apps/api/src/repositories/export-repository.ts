import { and, eq, isNull } from 'drizzle-orm';
import type { RecordEnvelope, RecordType } from '@petcare/domain';
import type { Db } from '../db/connection';
import { fileObjects } from '../db/schema';
import { toEnvelope } from './record-repository';
import type { RecordRow } from './record-repository';
import { columnsOf, recordTables } from './sync-registry';

export type ExportedFile = typeof fileObjects.$inferSelect;

/** Everything a household holds, for the account export (CAP-19). */
export function createExportRepository(db: Db) {
  return {
    /** Live records of every type, as the envelopes clients see. */
    async records(householdId: string): Promise<RecordEnvelope[]> {
      const out: RecordEnvelope[] = [];
      for (const [type, table] of Object.entries(recordTables)) {
        const all = columnsOf(type as RecordType).all;
        const household = all.householdId;
        const deleted = all.deletedAt;
        if (!household || !deleted) throw new Error(`${type} has no household or deletedAt column`);
        const rows = await db
          .select()
          .from(table)
          .where(and(eq(household, householdId), isNull(deleted)));
        for (const row of rows) out.push(toEnvelope(type as RecordType, row as RecordRow));
      }
      return out;
    },

    async files(householdId: string): Promise<ExportedFile[]> {
      return db
        .select()
        .from(fileObjects)
        .where(and(eq(fileObjects.householdId, householdId), isNull(fileObjects.deletedAt)));
    },
  };
}
