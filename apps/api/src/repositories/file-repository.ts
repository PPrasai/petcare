import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db/connection';
import { fileObjects } from '../db/schema';

export type FileRow = typeof fileObjects.$inferSelect;

/** file_objects: metadata of uploaded blobs. */
export function createFileRepository(db: Db) {
  return {
    /** Total bytes of the household's live files. */
    async usedBytes(householdId: string): Promise<number> {
      const [row] = await db
        .select({ total: sql<string>`coalesce(sum(${fileObjects.sizeBytes}), 0)` })
        .from(fileObjects)
        .where(and(eq(fileObjects.householdId, householdId), isNull(fileObjects.deletedAt)));
      return Number(row?.total ?? 0);
    },

    async insert(row: Omit<FileRow, 'createdAt' | 'deletedAt'>): Promise<FileRow> {
      const [created] = await db.insert(fileObjects).values(row).returning();
      if (!created) throw new Error('file insert returned no row');
      return created;
    },

    async find(fileId: string): Promise<FileRow | null> {
      const [row] = await db
        .select()
        .from(fileObjects)
        .where(and(eq(fileObjects.id, fileId), isNull(fileObjects.deletedAt)));
      return row ?? null;
    },

    async markDeleted(fileId: string): Promise<void> {
      await db.update(fileObjects).set({ deletedAt: new Date() }).where(eq(fileObjects.id, fileId));
    },
  };
}
