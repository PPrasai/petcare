import { describe, expect, it } from 'vitest';
import { localSnapshot, serverSnapshot } from './support/compare';
import { useSystemWorld } from './support/harness';

// QA-06 / I-01: a batch sent twice (the response was lost) is applied once.
const world = useSystemWorld();

describe('a lost push response', () => {
  it('re-sending the same batch applies it once and yields the same result', async () => {
    const a = await world.newDevice('frank');
    const householdId = (await a.session.request('GET', '/api/me')).json().households[0]
      .id as string;
    const pet = await a.store.create('pet', householdId, { name: 'Momo', species: 'dog' });
    await a.store.update('pet', pet.id, { diet: 'wet' });
    await a.store.create('contact', householdId, { name: 'Dr. Vet', role: 'vet' });

    a.remote.loseNextPushResponse = true;
    const first = await a.engine.sync();
    expect(first.online).toBe(false);
    expect(await a.db.outbox.count()).toBe(2); // still queued, not in flight
    expect((await a.db.outbox.toArray()).every((e) => !e.sending)).toBe(true);

    a.remote.offline = false;
    const second = await a.engine.sync();
    expect(second.error).toBeNull();

    // The same mutation ids went out twice.
    const [firstPush, secondPush] = a.remote.pushes;
    expect(secondPush?.mutations.map((m) => m.mutationId)).toEqual(
      firstPush?.mutations.map((m) => m.mutationId),
    );

    // Applied once: one pet at version 1 (create + coalesced update), one change_log row each.
    const log = await world.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM change_log WHERE record_id = $1',
      [pet.id],
    );
    expect(log[0]?.n).toBe(1);
    const pets = await world.query<{ version: number }>('SELECT version FROM pets WHERE id = $1', [
      pet.id,
    ]);
    expect(pets).toEqual([{ version: 1 }]);
    const mutations = await world.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM sync_mutations WHERE user_id = $1',
      [a.userId],
    );
    expect(mutations[0]?.n).toBe(2);
    expect(await localSnapshot(a)).toEqual(await serverSnapshot(a));
  });

  it('replaying a whole batch over HTTP returns identical results', async () => {
    const a = await world.newDevice('gina');
    const householdId = (await a.session.request('GET', '/api/me')).json().households[0]
      .id as string;
    const mutations = [
      {
        mutationId: '0197c8a0-0000-7000-8000-00000000f001',
        type: 'pet',
        id: '0197c8a0-0000-7000-8000-00000000f101',
        householdId,
        op: 'create',
        baseVersion: 0,
        fields: { name: 'Twice', species: 'dog' },
        clientTime: new Date().toISOString(),
      },
    ];
    const body = { clientId: '0197c8a0-0000-7000-8000-00000000f0ff', mutations };
    const one = (await a.session.request('POST', '/api/sync/push', body)).json();
    const two = (await a.session.request('POST', '/api/sync/push', body)).json();
    expect(two.results).toEqual(one.results);
    const rows = await world.query<{ version: number }>('SELECT version FROM pets WHERE id = $1', [
      mutations[0]?.id,
    ]);
    expect(rows).toEqual([{ version: 1 }]);
  });
});
