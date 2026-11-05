import { can } from '@petcare/domain';
import type { Operation, RecordType } from '@petcare/domain';
import { useSessionStore } from '../../state/session';

/** Whether the signed-in user may perform `op` on `type` in their household (UI hint only; the server decides). */
export function useCan(op: Operation, type: RecordType, fields?: string[]): boolean {
  const role = useSessionStore((s) => s.households[0]?.role);
  const userId = useSessionStore((s) => s.user?.id ?? '');
  if (!role) return false;
  return can(role, op, type, { actorId: userId, createdBy: userId, ...(fields ? { fields } : {}) });
}

/** The household the app is showing. Slice 13 adds switching between households. */
export function useHouseholdId(): string {
  return useSessionStore((s) => s.households[0]?.id ?? '');
}
