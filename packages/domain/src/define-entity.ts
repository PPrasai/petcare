import type { z } from 'zod';
import type { RecordType } from './schemas';

export type EntityKind = 'mergeable' | 'appendOnly';

/** How a record produces due occurrences for reminders (CON-002 2.6). */
export type DueSource =
  | { kind: 'schedule' } // data.schedule (medication, careRoutine, reminder)
  | { kind: 'date'; field: 'nextDueOn' | 'followUpOn' }; // single occurrence at 09:00 local

export interface EntityDefinition {
  type: RecordType;
  kind: EntityKind;
  /** Zod schema of the record's `data`. */
  schema: z.ZodType;
  /** data field -> record type it must reference (same household, not deleted). */
  refs: Record<string, RecordType>;
  /** data fields that hold file ids (a single id or an array of ids). */
  fileRefs: string[];
  /** data field naming the parent pet, if any. */
  parent?: 'petId';
  dueSource?: DueSource;
  /** Client-side Dexie index fields (besides id, householdId, type). */
  indexes: string[];
}

/** Declares one record type. The registry, sync, permissions and reminders read these. */
export function defineEntity(def: EntityDefinition): EntityDefinition {
  return def;
}
