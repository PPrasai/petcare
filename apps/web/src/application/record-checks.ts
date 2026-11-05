import { getEntity } from '@petcare/domain';
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
