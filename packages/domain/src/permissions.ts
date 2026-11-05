import type { RecordType } from './schemas';
import { RECORD_TYPES } from './schemas';

export type Role = 'owner' | 'caretaker' | 'viewer';
export type Operation = 'create' | 'update' | 'delete';
export const ROLES: Role[] = ['owner', 'caretaker', 'viewer'];
export const OPERATIONS: Operation[] = ['create', 'update', 'delete'];

/** Pet fields only an owner may change (archiving). */
export const OWNER_ONLY_PET_FIELDS = ['archivedAt', 'archivedReason'];

export interface PermissionContext {
  actorId: string;
  /** createdBy of the existing record (update / delete). */
  createdBy?: string;
  /** Top-level data keys an update changes. */
  fields?: string[];
}

/**
 * The permission table (AS-petcare-001 section 6). QA-07 is generated from this function.
 * - owner: everything.
 * - caretaker: create and update any type except emergencyCard; delete only records they
 *   created; may not delete or archive pets.
 * - viewer: read only.
 * Append-only rules (an update is never allowed) are applied by the sync service, not here.
 */
export function can(role: Role, op: Operation, type: RecordType, ctx: PermissionContext): boolean {
  if (role === 'owner') return true;
  if (role === 'viewer') return false;
  if (type === 'emergencyCard') return false;
  if (op === 'create') return true;
  if (op === 'update') {
    if (type === 'pet') return !(ctx.fields ?? []).some((f) => OWNER_ONLY_PET_FIELDS.includes(f));
    return true;
  }
  if (type === 'pet') return false;
  return ctx.createdBy === ctx.actorId;
}

/** Household member management is owner-only (REST, not sync). */
export function canManageMembers(role: Role): boolean {
  return role === 'owner';
}

/** All (role, op, type) cells, for table-driven tests. */
export function permissionCells(): { role: Role; op: Operation; type: RecordType }[] {
  return ROLES.flatMap((role) =>
    OPERATIONS.flatMap((op) => RECORD_TYPES.map((type) => ({ role, op, type }))),
  );
}
