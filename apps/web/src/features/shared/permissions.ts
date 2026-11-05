import { can } from '@petcare/domain';
import type { Operation, RecordType } from '@petcare/domain';
import { activeHousehold, useSessionStore } from '../../state/session';

/** Whether the signed-in user may perform `op` on `type` in their household (UI hint only; the server decides). */
export function useCan(op: Operation, type: RecordType, fields?: string[]): boolean {
  const role = useSessionStore((s) => activeHousehold(s)?.role);
  const userId = useSessionStore((s) => s.user?.id ?? '');
  if (!role) return false;
  return can(role, op, type, { actorId: userId, createdBy: userId, ...(fields ? { fields } : {}) });
}

/** Whether the user may delete a record of `type` created by `createdBy` (caretakers: only their own). */
export function useCanDelete(type: RecordType): (createdBy: string) => boolean {
  const role = useSessionStore((s) => activeHousehold(s)?.role);
  const userId = useSessionStore((s) => s.user?.id ?? '');
  return (createdBy) =>
    role !== undefined && can(role, 'delete', type, { actorId: userId, createdBy });
}

/** The household the app is showing. Slice 13 adds switching between households. */
export function useHouseholdId(): string {
  return useSessionStore((s) => activeHousehold(s)?.id ?? '');
}
