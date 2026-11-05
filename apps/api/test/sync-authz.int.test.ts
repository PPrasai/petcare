import { describe, expect, it } from 'vitest';
import { can, getEntity } from '@petcare/domain';
import type { RecordType, Role } from '@petcare/domain';
import { ApiClient } from './support/api-client';
import { ALL_TYPES, updateFor, validData } from './support/record-fixtures';
import { mutation, pet, pushOne, uid } from './support/sync-helpers';
import { useSyncWorld } from './support/sync-world';

/**
 * QA-07, sync part: for every (role x record type x operation) a push is generated and its
 * outcome must match the permission table in packages/domain/src/permissions.ts, plus the
 * append-only rule. Outsiders get notFound, never forbidden; anonymous callers get 401.
 */
const world = useSyncWorld();

const ROLES = ['owner', 'caretaker', 'viewer'] as const;

/** A pet used only by one test cell, so cells never interfere (emergency cards are unique per pet). */
async function freshPet(householdId: string): Promise<string> {
  const id = uid();
  await pushOne(
    world.people().owner.client,
    mutation(householdId, 'pet', 'create', pet('Cell pet'), { id }),
  );
  return id;
}

async function existingRecord(
  type: RecordType,
  householdId: string,
  refs: Awaited<ReturnType<typeof world.household>>['refs'],
  createdBy: 'owner' | 'caretaker',
) {
  const petId = type === 'pet' ? refs.petId : await freshPet(householdId);
  const creator = world.people()[createdBy];
  const data =
    type === 'reminderSnooze'
      ? { ...validData(type, refs, petId), userId: creator.userId }
      : validData(type, refs, petId);
  const result = await pushOne(creator.client, mutation(householdId, type, 'create', data));
  if (result.status !== 'applied') throw new Error(`setup ${type}: ${JSON.stringify(result)}`);
  if (!result.record) throw new Error(`setup ${type}: no record`);
  return result.record;
}

describe('create', () => {
  for (const type of ALL_TYPES) {
    for (const role of ROLES) {
      it(`${role} creates ${type}`, async () => {
        const { householdId, refs } = await world.household();
        const petId = type === 'pet' ? refs.petId : await freshPet(householdId);
        const actor = world.people()[role];
        const data =
          type === 'reminderSnooze'
            ? { ...validData(type, refs, petId), userId: actor.userId }
            : validData(type, refs, petId);
        const result = await pushOne(actor.client, mutation(householdId, type, 'create', data));
        const allowed = can(role as Role, 'create', type, { actorId: actor.userId });
        expect(result.status, JSON.stringify(result.error)).toBe(allowed ? 'applied' : 'rejected');
        if (!allowed) expect(result.error?.code).toBe('forbidden');
      });
    }

    it(`an outsider creating ${type} gets notFound`, async () => {
      const { householdId, refs } = await world.household();
      const outsider = world.people().outsider;
      const data =
        type === 'reminderSnooze'
          ? { ...validData(type, refs), userId: outsider.userId }
          : validData(type, refs);
      const result = await pushOne(outsider.client, mutation(householdId, type, 'create', data));
      expect(result.error?.code).toBe('notFound');
    });
  }
});

describe('update', () => {
  for (const type of ALL_TYPES) {
    const entity = getEntity(type);
    for (const role of ROLES) {
      it(`${role} updates ${type}`, async () => {
        const { householdId, refs } = await world.household();
        const existing = await existingRecord(type, householdId, refs, 'owner');
        const fields = updateFor[type] ?? { note: 'changed' };
        const actor = world.people()[role];
        const result = await pushOne(
          actor.client,
          mutation(householdId, type, 'update', fields, {
            id: existing.id,
            baseVersion: existing.version,
          }),
        );
        const allowed = can(role as Role, 'update', type, {
          actorId: actor.userId,
          createdBy: existing.createdBy,
          fields: Object.keys(fields),
        });
        if (entity.kind === 'appendOnly') {
          // Append-only: nobody updates. Viewers are refused first, as for any write.
          expect(result.status).toBe('rejected');
          expect(result.error?.code).toBe(allowed ? 'appendOnlyUpdate' : 'forbidden');
        } else {
          expect(result.status, JSON.stringify(result.error)).toBe(
            allowed ? 'applied' : 'rejected',
          );
          if (!allowed) expect(result.error?.code).toBe('forbidden');
        }
      });
    }

    it(`an outsider updating ${type} gets notFound`, async () => {
      const { householdId, refs } = await world.household();
      const existing = await existingRecord(type, householdId, refs, 'owner');
      const result = await pushOne(
        world.people().outsider.client,
        mutation(householdId, type, 'update', updateFor[type] ?? { note: 'x' }, {
          id: existing.id,
          baseVersion: 1,
        }),
      );
      expect(result.error?.code).toBe('notFound');
    });
  }

  it('a caretaker may edit but not archive a pet', async () => {
    const { householdId, refs } = await world.household();
    const caretaker = world.people().caretaker.client;
    const edit = await pushOne(
      caretaker,
      mutation(householdId, 'pet', 'update', { diet: 'x' }, { id: refs.petId, baseVersion: 1 }),
    );
    expect(edit.status).toBe('applied');
    const archive = await pushOne(
      caretaker,
      mutation(
        householdId,
        'pet',
        'update',
        { archivedAt: '2026-06-01T00:00:00Z', archivedReason: 'rehomed' },
        { id: refs.petId, baseVersion: 2 },
      ),
    );
    expect(archive.error?.code).toBe('forbidden');
    const owner = await pushOne(
      world.people().owner.client,
      mutation(
        householdId,
        'pet',
        'update',
        { archivedAt: '2026-06-01T00:00:00Z', archivedReason: 'rehomed' },
        { id: refs.petId, baseVersion: 2 },
      ),
    );
    expect(owner.status).toBe('applied');
  });
});

describe('delete', () => {
  for (const type of ALL_TYPES) {
    for (const role of ROLES) {
      it(`${role} deletes a ${type} created by the owner`, async () => {
        const { householdId, refs } = await world.household();
        const existing = await existingRecord(type, householdId, refs, 'owner');
        const actor = world.people()[role];
        const result = await pushOne(
          actor.client,
          mutation(
            householdId,
            type,
            'delete',
            {},
            { id: existing.id, baseVersion: existing.version },
          ),
        );
        const allowed = can(role as Role, 'delete', type, {
          actorId: actor.userId,
          createdBy: existing.createdBy,
        });
        expect(result.status, JSON.stringify(result.error)).toBe(allowed ? 'applied' : 'rejected');
        if (!allowed) expect(result.error?.code).toBe('forbidden');
      });
    }

    it(`a caretaker deletes a ${type} they created themselves`, async () => {
      if (type === 'emergencyCard') return; // caretakers cannot create or delete cards
      const { householdId, refs } = await world.household();
      const existing = await existingRecord(type, householdId, refs, 'caretaker');
      const caretaker = world.people().caretaker;
      const result = await pushOne(
        caretaker.client,
        mutation(
          householdId,
          type,
          'delete',
          {},
          { id: existing.id, baseVersion: existing.version },
        ),
      );
      const allowed = can('caretaker', 'delete', type, {
        actorId: caretaker.userId,
        createdBy: existing.createdBy,
      });
      expect(result.status).toBe(allowed ? 'applied' : 'rejected');
      // Own records can be deleted by a caretaker, except pets.
      expect(allowed).toBe(type !== 'pet');
    });

    it(`an outsider deleting ${type} gets notFound`, async () => {
      const { householdId, refs } = await world.household();
      const existing = await existingRecord(type, householdId, refs, 'owner');
      const result = await pushOne(
        world.people().outsider.client,
        mutation(householdId, type, 'delete', {}, { id: existing.id, baseVersion: 1 }),
      );
      expect(result.error?.code).toBe('notFound');
    });
  }
});

describe('anonymous callers', () => {
  it('get 401 on push, pull and resolve', async () => {
    const anon = new ApiClient(world.api());
    expect((await anon.post('/api/sync/push', { clientId: uid(), mutations: [] })).statusCode).toBe(
      401,
    );
    expect((await anon.get('/api/sync/pull')).statusCode).toBe(401);
    expect((await anon.post(`/api/conflicts/${uid()}/resolve`)).statusCode).toBe(401);
  });

  it('a push with no valid session never reaches a record', async () => {
    const { householdId } = await world.household();
    const anon = new ApiClient(world.api());
    const res = await anon.post('/api/sync/push', {
      clientId: uid(),
      mutations: [mutation(householdId, 'pet', 'create', pet())],
    });
    expect(res.statusCode).toBe(401);
  });
});
