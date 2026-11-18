import { getEntity } from '@petcare/domain';
import type { RecordStore, StoredRecord } from './ports/record-store';
import type { RecordType } from '@petcare/domain';
import { InvalidInput } from './pet-service';

/** Drops empty values (undefined, null, empty string) so optional fields stay absent. */
export function withoutEmptyValues(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
}

/** Validates against the shared schema; throws InvalidInput naming the first bad field. */
export function checkRecord(type: RecordType, data: Record<string, unknown>): void {
  const parsed = getEntity(type).schema.safeParse(data);
  if (!parsed.success) throw new InvalidInput(parsed.error.issues[0]?.path.join('.') ?? '');
}

/**
 * What to send to turn `current` into `next` (the whole new record data, empty values already
 * left out): the values that differ, and `null` for a field that is no longer there.
 */
export function changedFields(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(current[key]) !== JSON.stringify(value)) fields[key] = value;
  }
  for (const key of Object.keys(current)) {
    // Lists (attached files) are managed outside the edit forms: absent there means unchanged.
    if (Array.isArray(current[key])) continue;
    if (!(key in next) && current[key] !== null && current[key] !== undefined) fields[key] = null;
  }
  return fields;
}

/**
 * Saves an edited record: validates the whole new data, then writes only what changed (so the
 * outbox sends a small update). Nothing is written when nothing changed.
 */
export async function updateRecord(
  records: RecordStore,
  type: RecordType,
  id: string,
  next: Record<string, unknown>,
): Promise<StoredRecord> {
  const current = await records.get(type, id);
  if (!current || current.deletedAt !== null) throw new InvalidInput('id');
  checkRecord(type, next);
  const fields = changedFields(current.data, next);
  // A cleared field is sent as null where the schema allows it, else as an empty string (notes).
  const schema = getEntity(type).schema;
  for (const [key, value] of Object.entries(fields)) {
    if (value === null && !schema.safeParse({ ...next, [key]: null }).success) fields[key] = '';
  }
  return Object.keys(fields).length === 0 ? current : records.update(type, id, fields);
}
