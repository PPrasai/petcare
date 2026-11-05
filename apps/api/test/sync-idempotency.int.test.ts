import { describe, expect, it } from 'vitest';
import { mutation, pet, push, uid } from './support/sync-helpers';
import { useSyncWorld } from './support/sync-world';

// CON-petcare-002 I-01 at the API level (the two-client version is QA-06 in tests/system).
const world = useSyncWorld();

describe('idempotency (I-01)', () => {
  it('sending the same batch twice returns identical results and changes nothing the second time', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const id = uid();
    const batch = [
      mutation(householdId, 'pet', 'create', pet('Twice'), { id }),
      mutation(householdId, 'pet', 'update', { diet: 'a' }, { id, baseVersion: 1 }),
      mutation(householdId, 'pet', 'create', { species: 'dog' }), // rejected
    ];
    const first = await push(owner, batch);
    const second = await push(owner, batch);
    expect(second).toEqual(first);

    const rows = await world.query<{ n: number; version: number }>(
      'SELECT count(*)::int AS n, max(version) AS version FROM pets WHERE id = $1',
      [id],
    );
    expect(rows[0]).toMatchObject({ n: 1, version: 2 });
    const log = await world.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM change_log WHERE record_id = $1',
      [id],
    );
    expect(log[0]?.n).toBe(2);
    const stored = await world.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM sync_mutations WHERE mutation_id = ANY($1)',
      [batch.map((m) => m.mutationId)],
    );
    expect(stored[0]?.n).toBe(3);
  });

  it('replays the first result even if the record has changed since', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const id = uid();
    const create = mutation(householdId, 'pet', 'create', pet('Replay'), { id });
    const [first] = await push(owner, [create]);
    await push(owner, [
      mutation(householdId, 'pet', 'update', { diet: 'later' }, { id, baseVersion: 1 }),
    ]);
    const [replay] = await push(owner, [create]);
    expect(replay).toEqual(first);
    expect(replay?.record?.version).toBe(1);
  });

  it('replays a rejection too', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const bad = mutation(householdId, 'pet', 'create', { species: 'dog' });
    const [first] = await push(owner, [bad]);
    const [second] = await push(owner, [bad]);
    expect(second).toEqual(first);
    expect(first?.status).toBe('rejected');
  });

  it("another user cannot replay or reuse someone else's mutationId", async () => {
    const { householdId } = await world.household();
    const { owner, caretaker } = world.people();
    const m = mutation(householdId, 'pet', 'create', pet('Mine'));
    await push(owner.client, [m]);
    const [theirs] = await push(caretaker.client, [m]);
    expect(theirs?.status).toBe('rejected');
    expect(theirs?.error?.code).toBe('invalid');
  });

  it('two identical requests racing each other apply once', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const id = uid();
    const batch = [mutation(householdId, 'pet', 'create', pet('Race'), { id })];
    const [a, b] = await Promise.all([push(owner, batch), push(owner, batch)]);
    expect(a).toEqual(b);
    const rows = await world.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM change_log WHERE record_id = $1',
      [id],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('concurrent updates from two people to different fields both land, versions stay gapless', async () => {
    const { householdId, refs } = await world.household();
    const { owner, caretaker } = world.people();
    const one = (fields: Record<string, unknown>) =>
      mutation(householdId, 'pet', 'update', fields, { id: refs.petId, baseVersion: 1 });
    await Promise.all([
      push(owner.client, [one({ diet: 'a' })]),
      push(caretaker.client, [one({ colour: 'b' })]),
      push(owner.client, [one({ markings: 'c' })]),
    ]);
    const [row] = await world.query<{
      version: number;
      diet: string;
      colour: string;
      markings: string;
    }>('SELECT version, diet, colour, markings FROM pets WHERE id = $1', [refs.petId]);
    expect(row).toMatchObject({ version: 4, diet: 'a', colour: 'b', markings: 'c' });
    const log = await world.query<{ version: number }>(
      'SELECT version FROM change_log WHERE record_id = $1 ORDER BY version',
      [refs.petId],
    );
    expect(log.map((l) => l.version)).toEqual([1, 2, 3, 4]);
  });
});
