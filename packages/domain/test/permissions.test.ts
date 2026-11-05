import { describe, expect, it } from 'vitest';
import { can, permissionCells, RECORD_TYPES } from '../src';

const owner = 'u-owner';
const other = 'u-other';

describe('permission table (AS section 6)', () => {
  it('has a cell for every role, operation and type', () => {
    expect(permissionCells()).toHaveLength(3 * 3 * RECORD_TYPES.length);
  });

  for (const { role, op, type } of permissionCells()) {
    it(`${role} ${op} ${type}`, () => {
      const own = can(role, op, type, { actorId: owner, createdBy: owner, fields: ['name'] });
      const foreign = can(role, op, type, { actorId: owner, createdBy: other, fields: ['name'] });
      if (role === 'owner') {
        expect(own && foreign).toBe(true);
      } else if (role === 'viewer') {
        expect(own || foreign).toBe(false);
      } else if (type === 'emergencyCard') {
        expect(own || foreign).toBe(false);
      } else if (op === 'delete' && type === 'pet') {
        expect(own || foreign).toBe(false);
      } else if (op === 'delete') {
        expect(own).toBe(true);
        expect(foreign).toBe(false);
      } else {
        expect(own && foreign).toBe(true);
      }
    });
  }

  it('lets a caretaker edit a pet but not archive it', () => {
    const ctx = { actorId: owner, createdBy: other };
    expect(can('caretaker', 'update', 'pet', { ...ctx, fields: ['diet'] })).toBe(true);
    expect(can('caretaker', 'update', 'pet', { ...ctx, fields: ['archivedAt'] })).toBe(false);
    expect(can('caretaker', 'update', 'pet', { ...ctx, fields: ['archivedReason'] })).toBe(false);
    expect(can('owner', 'update', 'pet', { ...ctx, fields: ['archivedAt'] })).toBe(true);
  });
});
