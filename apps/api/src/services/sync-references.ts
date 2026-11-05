import type { getEntity, RecordType } from '@petcare/domain';
import type { Repositories } from '../repositories';
import type { Mutation } from './sync-types';

/** Checks every reference in `values` (same household, not deleted). Returns the first problem. */
export async function checkReferences(
  tx: Repositories,
  m: Mutation,
  entity: ReturnType<typeof getEntity>,
  values: Record<string, unknown>,
  keys: string[],
): Promise<{ message: string; path: string } | null> {
  for (const [field, refType] of Object.entries(entity.refs)) {
    const value = values[field];
    if (!keys.includes(field) || typeof value !== 'string') continue;
    if (!(await tx.records.existsLive(refType, value, m.householdId))) {
      return { message: `${field} not found in household`, path: `/${field}` };
    }
  }
  for (const field of entity.fileRefs) {
    const value = values[field];
    if (!keys.includes(field) || value === null || value === undefined) continue;
    for (const fileId of Array.isArray(value) ? value : [value]) {
      if (typeof fileId === 'string' && !(await tx.sync.liveFile(fileId, m.householdId))) {
        return { message: `${field} file not found in household`, path: `/${field}` };
      }
    }
  }
  if (m.type === 'reminderSnooze' && keys.some((k) => k === 'sourceId' || k === 'sourceType')) {
    const ok = await tx.records.existsLive(
      values.sourceType as RecordType,
      String(values.sourceId),
      m.householdId,
    );
    if (!ok) return { message: 'sourceId not found in household', path: '/sourceId' };
  }
  if (m.type === 'document' && values.linkedRecordType && values.linkedRecordId) {
    const ok = await tx.records.existsLive(
      values.linkedRecordType as RecordType,
      String(values.linkedRecordId),
      m.householdId,
    );
    if (!ok) return { message: 'linkedRecordId not found in household', path: '/linkedRecordId' };
  }
  return null;
}
