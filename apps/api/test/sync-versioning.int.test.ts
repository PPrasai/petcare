import { describe, expect, it } from 'vitest';
import { mutation, pet, pushOne } from './support/sync-helpers';
import { useSyncWorld } from './support/sync-world';

// CON-petcare-002 I-05: version rises by exactly 1 per applied change, and change_log has one
// row per version.
const world = useSyncWorld();

describe('versions and the change log (I-05)', () => {
  it('create, three updates, a no-op, and a delete give versions 1..5 with matching log rows', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const created = await pushOne(owner, mutation(householdId, 'pet', 'create', pet()));
    const id = created.record?.id ?? '';
    let version = 1;
    for (const diet of ['a', 'b', 'c']) {
      const res = await pushOne(
        owner,
        mutation(householdId, 'pet', 'update', { diet }, { id, baseVersion: version }),
      );
      expect(res.record?.version).toBe(++version);
    }
    const noop = await pushOne(
      owner,
      mutation(householdId, 'pet', 'update', { diet: 'c' }, { id, baseVersion: version }),
    );
    expect(noop.record?.version).toBe(version);
    const del = await pushOne(
      owner,
      mutation(householdId, 'pet', 'delete', {}, { id, baseVersion: version }),
    );
    expect(del.record?.version).toBe(++version);
    await pushOne(owner, mutation(householdId, 'pet', 'delete', {}, { id, baseVersion: version }));

    const log = await world.query<{
      version: number;
      op: string;
      changed_fields: string[];
      actor: string;
    }>(
      'SELECT version, op, changed_fields, actor FROM change_log WHERE record_id = $1 ORDER BY version',
      [id],
    );
    expect(log.map((l) => l.version)).toEqual([1, 2, 3, 4, 5]);
    expect(log.map((l) => l.op)).toEqual(['create', 'update', 'update', 'update', 'delete']);
    expect(log[0]?.changed_fields).toEqual(['*']);
    expect(log[1]?.changed_fields).toEqual(['diet']);
    expect(log[4]?.changed_fields).toEqual(['*']);
    expect(new Set(log.map((l) => l.actor))).toEqual(new Set([world.people().owner.userId]));
  });

  it('seq grows with every change and changed_fields lists only keys that really changed', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const created = await pushOne(
      owner,
      mutation(householdId, 'pet', 'create', { ...pet(), breed: 'Terrier' }),
    );
    const id = created.record?.id ?? '';
    await pushOne(
      owner,
      mutation(
        householdId,
        'pet',
        'update',
        { breed: 'Terrier', diet: 'wet' },
        { id, baseVersion: 1 },
      ),
    );
    const log = await world.query<{ seq: string; changed_fields: string[] }>(
      'SELECT seq, changed_fields FROM change_log WHERE record_id = $1 ORDER BY seq',
      [id],
    );
    expect(Number(log[1]?.seq)).toBeGreaterThan(Number(log[0]?.seq));
    expect(log[1]?.changed_fields).toEqual(['diet']);
  });

  it('a rejected mutation changes nothing and writes no log row', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const before = await world.query<{ n: number }>('SELECT count(*)::int AS n FROM change_log');
    const bad = await pushOne(owner, mutation(householdId, 'pet', 'create', { species: 'dog' }));
    expect(bad.status).toBe('rejected');
    const after = await world.query<{ n: number }>('SELECT count(*)::int AS n FROM change_log');
    expect(after[0]?.n).toBe(before[0]?.n);
  });
});
