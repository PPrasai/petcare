import { and, asc, desc, eq, gte, inArray, isNull, lte, min, sql } from 'drizzle-orm';
import type { Db } from '../db/connection';
import { changeLog, conflicts, emergencyTokens, fileObjects, syncMutations } from '../db/schema';

/** Serialises every transaction that writes the change log, so `seq` order is commit order. */
export const CHANGE_LOG_LOCK_KEY = 7231002;

export interface ChangeLogEntry {
  householdId: string;
  recordType: string;
  recordId: string;
  version: number;
  op: 'create' | 'update' | 'delete';
  changedFields: string[];
  actor: string;
}

export interface ConflictRow {
  id: string;
  householdId: string;
  recordType: string;
  recordId: string;
  field: string | null;
  keptValue: unknown;
  replacedValue: unknown;
  replacedBy: string;
  winningBy: string;
  reason: 'concurrentFieldEdit' | 'updateAfterDelete';
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

const conflictColumns = {
  id: conflicts.id,
  householdId: conflicts.householdId,
  recordType: conflicts.recordType,
  recordId: conflicts.recordId,
  field: conflicts.field,
  keptValue: conflicts.keptValue,
  replacedValue: conflicts.replacedValue,
  replacedBy: conflicts.replacedBy,
  winningBy: conflicts.winningBy,
  reason: conflicts.reason,
  createdAt: conflicts.createdAt,
  resolvedAt: conflicts.resolvedAt,
  resolvedBy: conflicts.resolvedBy,
};
const toConflict = (r: Omit<ConflictRow, 'reason'> & { reason: string }): ConflictRow => ({
  ...r,
  reason: r.reason as ConflictRow['reason'],
});

/** change_log, sync_mutations, conflicts and the file existence check used by sync. */
export function createSyncRepository(db: Db) {
  return {
    // ---- change log ----

    /** Take this lock right before writing change_log rows; it is released at commit. */
    async lockChangeLog(): Promise<void> {
      await db.execute(sql`SELECT pg_advisory_xact_lock(${CHANGE_LOG_LOCK_KEY})`);
    },

    async appendChanges(entries: ChangeLogEntry[]): Promise<void> {
      if (entries.length === 0) return;
      // `at` uses clock_timestamp() so it is monotone under the lock (the transaction's now() is not).
      await db.insert(changeLog).values(entries.map((e) => ({ ...e, at: sql`clock_timestamp()` })));
    },

    /** Change-log rows of one record after `version`, newest first. */
    async changesAfter(
      recordId: string,
      version: number,
    ): Promise<{ version: number; changedFields: string[]; actor: string }[]> {
      const rows = await db
        .select({
          version: changeLog.version,
          changedFields: changeLog.changedFields,
          actor: changeLog.actor,
        })
        .from(changeLog)
        .where(and(eq(changeLog.recordId, recordId), sql`${changeLog.version} > ${version}`))
        .orderBy(desc(changeLog.version));
      return rows;
    },

    /** One page of changed records: each record once, with its latest seq, oldest first. */
    async changedRecords(
      householdIds: string[],
      afterSeq: number,
      limit: number,
    ): Promise<{ recordType: string; recordId: string; lastSeq: number }[]> {
      if (householdIds.length === 0) return [];
      const lastSeq = sql<number>`max(${changeLog.seq})`;
      const rows = await db
        .select({ recordType: changeLog.recordType, recordId: changeLog.recordId, lastSeq })
        .from(changeLog)
        .where(
          and(inArray(changeLog.householdId, householdIds), sql`${changeLog.seq} > ${afterSeq}`),
        )
        .groupBy(changeLog.recordType, changeLog.recordId)
        .orderBy(asc(lastSeq))
        .limit(limit);
      return rows.map((r) => ({ ...r, lastSeq: Number(r.lastSeq) }));
    },

    async oldestSeq(): Promise<number | null> {
      const [row] = await db.select({ oldest: min(changeLog.seq) }).from(changeLog);
      return row?.oldest ?? null;
    },

    /** Time of the newest change-log row at or before `seq`, or null. */
    async changeTimeAt(seq: number): Promise<Date | null> {
      const [row] = await db
        .select({ at: changeLog.at })
        .from(changeLog)
        .where(lte(changeLog.seq, seq))
        .orderBy(desc(changeLog.seq))
        .limit(1);
      return row?.at ?? null;
    },

    // ---- idempotency ----

    async findMutation(mutationId: string): Promise<{ userId: string; result: unknown } | null> {
      const [row] = await db
        .select({ userId: syncMutations.userId, result: syncMutations.result })
        .from(syncMutations)
        .where(eq(syncMutations.mutationId, mutationId));
      return row ?? null;
    },

    async storeMutation(mutationId: string, userId: string, result: unknown): Promise<void> {
      await db.insert(syncMutations).values({ mutationId, userId, result });
    },

    // ---- conflicts ----

    async insertConflicts(
      rows: Omit<ConflictRow, 'createdAt' | 'resolvedAt' | 'resolvedBy'>[],
    ): Promise<void> {
      if (rows.length === 0) return;
      await db
        .insert(conflicts)
        .values(rows.map((r) => ({ ...r, createdAt: sql`clock_timestamp()` })));
    },

    async unresolvedConflicts(householdIds: string[], since: Date | null): Promise<ConflictRow[]> {
      if (householdIds.length === 0) return [];
      const rows = await db
        .select(conflictColumns)
        .from(conflicts)
        .where(
          and(
            inArray(conflicts.householdId, householdIds),
            isNull(conflicts.resolvedAt),
            since ? gte(conflicts.createdAt, since) : undefined,
          ),
        )
        .orderBy(asc(conflicts.createdAt));
      return rows.map(toConflict);
    },

    async findConflict(id: string): Promise<ConflictRow | null> {
      const [row] = await db.select(conflictColumns).from(conflicts).where(eq(conflicts.id, id));
      return row ? toConflict(row) : null;
    },

    async resolveConflict(id: string, userId: string, now: Date): Promise<void> {
      await db
        .update(conflicts)
        .set({ resolvedAt: now, resolvedBy: userId })
        .where(and(eq(conflicts.id, id), isNull(conflicts.resolvedAt)));
    },

    /** An emergency card's public link stops working at once. */
    async removeEmergencyTokens(cardIds: string[]): Promise<void> {
      if (cardIds.length === 0) return;
      await db.delete(emergencyTokens).where(inArray(emergencyTokens.cardId, cardIds));
    },

    // ---- files ----

    /** True when the file exists in this household and is not deleted. */
    async liveFile(fileId: string, householdId: string): Promise<boolean> {
      const rows = await db
        .select({ id: fileObjects.id })
        .from(fileObjects)
        .where(
          and(
            eq(fileObjects.id, fileId),
            eq(fileObjects.householdId, householdId),
            isNull(fileObjects.deletedAt),
          ),
        );
      return rows.length > 0;
    },
  };
}
