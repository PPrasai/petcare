import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { RecordEnvelope, RecordType } from '@petcare/domain';
import type { Db } from '../db/connection';
import { columnsOf, fromColumnValue, iso, recordTables } from './sync-registry';

/** A row of any record table, keyed by its camelCase column names. */
export type RecordRow = Record<string, unknown> & {
  id: string;
  householdId: string;
  version: number;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
  deletedAt: Date | null;
};

/** The row as the JSON envelope clients see. NULL columns are left out of `data`. */
export function toEnvelope(type: RecordType, row: RecordRow): RecordEnvelope {
  const data: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columnsOf(type).data)) {
    const value = row[key];
    if (value !== null && value !== undefined) data[key] = fromColumnValue(column, value);
  }
  return {
    id: row.id,
    type,
    householdId: row.householdId,
    version: row.version,
    createdAt: iso(row.createdAt),
    createdBy: row.createdBy,
    updatedAt: iso(row.updatedAt),
    updatedBy: row.updatedBy,
    deletedAt: row.deletedAt ? iso(row.deletedAt) : null,
    data,
  };
}

/** Generic reads and writes over the 17 record tables. */
export function createRecordRepository(db: Db) {
  const table = (type: RecordType) => recordTables[type];
  const col = (type: RecordType, name: string) => {
    const column = columnsOf(type).all[name];
    if (!column) throw new Error(`${type} has no column ${name}`);
    return column;
  };

  return {
    /** The record in any household, locked for update (tombstones included). */
    async findForUpdate(type: RecordType, id: string): Promise<RecordRow | null> {
      const rows = await db
        .select()
        .from(table(type))
        .where(eq(col(type, 'id'), id))
        .for('update');
      return (rows[0] as RecordRow | undefined) ?? null;
    },

    async find(type: RecordType, id: string): Promise<RecordRow | null> {
      const rows = await db
        .select()
        .from(table(type))
        .where(eq(col(type, 'id'), id));
      return (rows[0] as RecordRow | undefined) ?? null;
    },

    /** True when a non-deleted record of this type exists in this household. */
    async existsLive(type: RecordType, id: string, householdId: string): Promise<boolean> {
      const rows = await db
        .select({ id: col(type, 'id') })
        .from(table(type))
        .where(
          and(
            eq(col(type, 'id'), id),
            eq(col(type, 'householdId'), householdId),
            isNull(col(type, 'deletedAt')),
          ),
        );
      return rows.length > 0;
    },

    /** True when another live emergency card already exists for this pet. */
    async liveCardForPet(petId: string, exceptId: string): Promise<boolean> {
      const rows = await db
        .select({ id: col('emergencyCard', 'id') })
        .from(table('emergencyCard'))
        .where(
          and(eq(col('emergencyCard', 'petId'), petId), isNull(col('emergencyCard', 'deletedAt'))),
        );
      return rows.some((r) => r.id !== exceptId);
    },

    async insert(type: RecordType, values: Record<string, unknown>): Promise<RecordRow> {
      const rows = await db.insert(table(type)).values(values).returning();
      return rows[0] as RecordRow;
    },

    async update(type: RecordType, id: string, set: Record<string, unknown>): Promise<RecordRow> {
      const rows = await db
        .update(table(type))
        .set(set)
        .where(eq(col(type, 'id'), id))
        .returning();
      return rows[0] as RecordRow;
    },

    /** Live records of `type` that belong to a pet, locked (for the delete cascade). */
    async liveByPetForUpdate(type: RecordType, petId: string): Promise<RecordRow[]> {
      const rows = await db
        .select()
        .from(table(type))
        .where(and(eq(col(type, 'petId'), petId), isNull(col(type, 'deletedAt'))))
        .for('update');
      return rows as RecordRow[];
    },

    /** Every record of the given ids, current envelope (tombstones included). */
    async findMany(type: RecordType, ids: string[]): Promise<RecordRow[]> {
      if (ids.length === 0) return [];
      const rows = await db
        .select()
        .from(table(type))
        .where(inArray(col(type, 'id'), ids));
      return rows as RecordRow[];
    },
  };
}
