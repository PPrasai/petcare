import { describe, expect, it } from 'vitest';
import { mutation, pet, pull, pushOne, uid } from './support/sync-helpers';
import { useSyncWorld } from './support/sync-world';

// CON-petcare-002 2.3 step 4: per-field last-writer-wins, with the replaced value kept.
const world = useSyncWorld();

async function seededPet(householdId: string) {
  const { owner } = world.people();
  const created = await pushOne(
    owner.client,
    mutation(householdId, 'pet', 'create', { ...pet('Momo'), diet: 'dry food' }),
  );
  return created.record?.id ?? '';
}

describe('concurrent edits', () => {
  it('different fields from the same base version merge with no conflict', async () => {
    const { householdId } = await world.household();
    const { owner, caretaker } = world.people();
    const id = await seededPet(householdId);
    const a = await pushOne(
      owner.client,
      mutation(householdId, 'pet', 'update', { diet: 'wet food' }, { id, baseVersion: 1 }),
    );
    const b = await pushOne(
      caretaker.client,
      mutation(householdId, 'pet', 'update', { colour: 'gold' }, { id, baseVersion: 1 }),
    );
    expect(a.status).toBe('applied');
    expect(b.status).toBe('applied');
    expect(b.conflictIds).toBeUndefined();
    expect(b.record?.data).toMatchObject({ diet: 'wet food', colour: 'gold' });
    const rows = await world.query(
      'SELECT count(*)::int AS n FROM conflicts WHERE record_id = $1',
      [id],
    );
    expect(rows[0]?.n).toBe(0);
  });

  it('the same field from the same base: last writer wins, the loser is kept as a conflict', async () => {
    const { householdId } = await world.household();
    const { owner, caretaker } = world.people();
    const id = await seededPet(householdId);
    await pushOne(
      owner.client,
      mutation(householdId, 'pet', 'update', { diet: 'wet food' }, { id, baseVersion: 1 }),
    );
    const b = await pushOne(
      caretaker.client,
      mutation(householdId, 'pet', 'update', { diet: 'raw food' }, { id, baseVersion: 1 }),
    );

    expect(b.status).toBe('merged');
    expect(b.record?.data.diet).toBe('raw food');
    expect(b.record?.version).toBe(3);
    expect(b.conflictIds).toHaveLength(1);

    const [conflict] = await world.query<{
      field: string;
      kept_value: unknown;
      replaced_value: unknown;
      replaced_by: string;
      winning_by: string;
      reason: string;
      resolved_at: Date | null;
    }>('SELECT * FROM conflicts WHERE id = $1', [b.conflictIds?.[0]]);
    expect(conflict).toMatchObject({
      field: 'diet',
      kept_value: 'raw food',
      replaced_value: 'wet food',
      replaced_by: owner.userId,
      winning_by: caretaker.userId,
      reason: 'concurrentFieldEdit',
      resolved_at: null,
    });
  });

  it('only the overlapping fields get conflict rows', async () => {
    const { householdId } = await world.household();
    const { owner, caretaker } = world.people();
    const id = await seededPet(householdId);
    await pushOne(
      owner.client,
      mutation(
        householdId,
        'pet',
        'update',
        { diet: 'wet food', colour: 'gold' },
        { id, baseVersion: 1 },
      ),
    );
    const b = await pushOne(
      caretaker.client,
      mutation(
        householdId,
        'pet',
        'update',
        { diet: 'raw food', markings: 'white paw' },
        { id, baseVersion: 1 },
      ),
    );
    expect(b.conflictIds).toHaveLength(1);
    const rows = await world.query<{ field: string }>(
      'SELECT field FROM conflicts WHERE record_id = $1',
      [id],
    );
    expect(rows.map((r) => r.field)).toEqual(['diet']);
  });

  it('writing the same value that is already stored is not a conflict', async () => {
    const { householdId } = await world.household();
    const { owner, caretaker } = world.people();
    const id = await seededPet(householdId);
    await pushOne(
      owner.client,
      mutation(householdId, 'pet', 'update', { diet: 'wet food' }, { id, baseVersion: 1 }),
    );
    const b = await pushOne(
      caretaker.client,
      mutation(householdId, 'pet', 'update', { diet: 'wet food' }, { id, baseVersion: 1 }),
    );
    expect(b.status).toBe('applied');
    expect(b.record?.version).toBe(2);
  });

  it('an up-to-date base version never conflicts', async () => {
    const { householdId } = await world.household();
    const { owner, caretaker } = world.people();
    const id = await seededPet(householdId);
    await pushOne(
      owner.client,
      mutation(householdId, 'pet', 'update', { diet: 'wet food' }, { id, baseVersion: 1 }),
    );
    const b = await pushOne(
      caretaker.client,
      mutation(householdId, 'pet', 'update', { diet: 'raw food' }, { id, baseVersion: 2 }),
    );
    expect(b.status).toBe('applied');
    expect(b.conflictIds).toBeUndefined();
  });

  it('records the right person as the one who lost when several edits intervened', async () => {
    const { householdId } = await world.household();
    const { owner, caretaker, viewer } = world.people();
    void viewer;
    const id = await seededPet(householdId);
    await pushOne(
      owner.client,
      mutation(householdId, 'pet', 'update', { diet: 'a' }, { id, baseVersion: 1 }),
    );
    await pushOne(
      caretaker.client,
      mutation(householdId, 'pet', 'update', { diet: 'b' }, { id, baseVersion: 2 }),
    );
    const c = await pushOne(
      owner.client,
      mutation(householdId, 'pet', 'update', { diet: 'c' }, { id, baseVersion: 1 }),
    );
    const [row] = await world.query<{ replaced_by: string; replaced_value: unknown }>(
      'SELECT * FROM conflicts WHERE id = $1',
      [c.conflictIds?.[0]],
    );
    expect(row?.replaced_value).toBe('b');
    expect(row?.replaced_by).toBe(caretaker.userId);
  });

  it('JSON fields conflict by value, not by key order', async () => {
    const { householdId, refs } = await world.household();
    const { owner, caretaker } = world.people();
    const med = refs.medicationId;
    const s1 = { tz: 'UTC', kind: 'daily', startOn: '2026-01-01', times: ['08:00'] };
    await pushOne(
      owner.client,
      mutation(householdId, 'medication', 'update', { schedule: s1 }, { id: med, baseVersion: 1 }),
    );
    // Same schedule, different key order: nothing changes.
    const same = await pushOne(
      caretaker.client,
      mutation(
        householdId,
        'medication',
        'update',
        { schedule: { times: ['08:00'], startOn: '2026-01-01', kind: 'daily', tz: 'UTC' } },
        { id: med, baseVersion: 1 },
      ),
    );
    expect(same.status).toBe('applied');
    expect(same.record?.version).toBe(2);
  });
});

describe('update vs delete', () => {
  it('delete wins: the late update is rejected as deleted and kept as a conflict', async () => {
    const { householdId } = await world.household();
    const { owner, caretaker } = world.people();
    const id = await seededPet(householdId);
    await pushOne(owner.client, mutation(householdId, 'pet', 'delete', {}, { id, baseVersion: 1 }));
    const late = await pushOne(
      caretaker.client,
      mutation(householdId, 'pet', 'update', { diet: 'raw food' }, { id, baseVersion: 1 }),
    );

    expect(late.status).toBe('rejected');
    expect(late.error?.code).toBe('deleted');
    expect(late.record?.deletedAt).not.toBeNull(); // the tombstone, so the client can rebase
    expect(late.conflictIds).toHaveLength(1);

    const [row] = await world.query<{
      field: string | null;
      kept_value: unknown;
      replaced_value: unknown;
      reason: string;
      replaced_by: string;
      winning_by: string;
    }>('SELECT * FROM conflicts WHERE id = $1', [late.conflictIds?.[0]]);
    expect(row).toMatchObject({
      field: null,
      kept_value: null,
      replaced_value: { diet: 'raw food' },
      reason: 'updateAfterDelete',
      replaced_by: caretaker.userId,
      winning_by: owner.userId,
    });
  });
});

describe('conflicts reach other members and can be resolved', () => {
  it('shows up in pull for every member until someone resolves it', async () => {
    const { householdId } = await world.household();
    const { owner, caretaker, viewer, outsider } = world.people();
    const id = await seededPet(householdId);
    await pushOne(
      owner.client,
      mutation(householdId, 'pet', 'update', { diet: 'a' }, { id, baseVersion: 1 }),
    );
    const b = await pushOne(
      caretaker.client,
      mutation(householdId, 'pet', 'update', { diet: 'b' }, { id, baseVersion: 1 }),
    );
    const conflictId = b.conflictIds?.[0] ?? '';

    for (const person of [owner, caretaker, viewer]) {
      const { body } = await pull(person.client);
      expect(
        body.conflicts.map((c: { id: string }) => c.id),
        person.email,
      ).toContain(conflictId);
    }
    expect(
      (await pull(outsider.client)).body.conflicts.map((c: { id: string }) => c.id),
    ).not.toContain(conflictId);

    expect((await viewer.client.post(`/api/conflicts/${conflictId}/resolve`)).statusCode).toBe(403);
    expect((await outsider.client.post(`/api/conflicts/${conflictId}/resolve`)).statusCode).toBe(
      404,
    );
    expect((await owner.client.post(`/api/conflicts/${uid()}/resolve`)).statusCode).toBe(404);
    const resolved = await owner.client.post(`/api/conflicts/${conflictId}/resolve`);
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().resolvedAt).not.toBeNull();

    const after = (await pull(owner.client)).body.conflicts.map((c: { id: string }) => c.id);
    expect(after).not.toContain(conflictId);
  });
});
