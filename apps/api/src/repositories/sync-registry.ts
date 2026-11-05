import { getTableColumns } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { RecordType } from '@petcare/domain';
import {
  careCompletions,
  careRoutines,
  conditions,
  contacts,
  documents,
  emergencyCards,
  expenses,
  measurements,
  medicationDoses,
  medications,
  pets,
  reminderCompletions,
  reminderSnoozes,
  reminders,
  symptomEntries,
  vaccinations,
  vetVisits,
} from '../db/schema';

/**
 * Which table stores each record type. Adding a record type means one line here (plus the
 * defineEntity file, the table and its migration): sync, change log and permissions are generic.
 */
export const recordTables: Record<string, PgTable> = {
  pet: pets,
  measurement: measurements,
  vaccination: vaccinations,
  medication: medications,
  medicationDose: medicationDoses,
  vetVisit: vetVisits,
  condition: conditions,
  symptomEntry: symptomEntries,
  careRoutine: careRoutines,
  careCompletion: careCompletions,
  reminder: reminders,
  reminderCompletion: reminderCompletions,
  reminderSnooze: reminderSnoozes,
  document: documents,
  expense: expenses,
  contact: contacts,
  emergencyCard: emergencyCards,
};

/**
 * Registers a table for a record type that is not built in. Used by the extensibility test
 * (QA-13b) to prove a new type needs nothing beyond its entity, table and this registry.
 */
export function registerRecordTable(type: string, table: PgTable): void {
  recordTables[type] = table;
  cache.delete(type as RecordType);
}

/** The columns every record table starts with. All other columns are the record's `data`. */
export const ENVELOPE_COLUMNS = [
  'id',
  'householdId',
  'version',
  'createdAt',
  'createdBy',
  'updatedAt',
  'updatedBy',
  'deletedAt',
] as const;

export interface TableColumns {
  all: Record<string, PgColumn>;
  /** data key -> column (the key is the same camelCase name as in the JSON). */
  data: Record<string, PgColumn>;
}

const cache = new Map<RecordType, TableColumns>();
const tableOf = (type: RecordType): PgTable => {
  const table = recordTables[type];
  if (!table) throw new Error(`no table registered for ${type}`);
  return table;
};

export function columnsOf(type: RecordType): TableColumns {
  let found = cache.get(type);
  if (!found) {
    const all = getTableColumns(tableOf(type)) as Record<string, PgColumn>;
    const data = Object.fromEntries(
      Object.entries(all).filter(([key]) => !(ENVELOPE_COLUMNS as readonly string[]).includes(key)),
    );
    found = { all, data };
    cache.set(type, found);
  }
  return found;
}

/** Record types whose table has a petId column: they are removed together with their pet. */
export const typesWithPetId: RecordType[] = (Object.keys(recordTables) as RecordType[]).filter(
  (type) => type !== 'pet' && 'petId' in columnsOf(type).all,
);

const isTimestamp = (column: PgColumn): boolean => column.columnType === 'PgTimestamp';

export const iso = (date: Date): string => date.toISOString().replace(/\.000Z$/, 'Z');

/** A JSON data value as the column stores it (ISO instants become Dates). */
export function toColumnValue(column: PgColumn, value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (isTimestamp(column) && typeof value === 'string') return new Date(value);
  return value;
}

/** A column value as JSON data (Dates become ISO instants). */
export function fromColumnValue(column: PgColumn, value: unknown): unknown {
  if (value instanceof Date) return iso(value);
  return value;
}

/** Key-order independent text, so equal JSON values compare equal whatever the key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Compares a stored value with an incoming JSON value after normalising how the column
 * would store it (instants to the same text, numbers to numbers, object key order ignored).
 */
export function sameStoredValue(column: PgColumn, stored: unknown, incoming: unknown): boolean {
  const normal = (v: unknown) => fromColumnValue(column, toColumnValue(column, v));
  return canonicalJson(normal(stored)) === canonicalJson(normal(incoming));
}
