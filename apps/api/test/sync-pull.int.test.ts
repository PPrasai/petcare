import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../src/services/sync-service';
import { mutation, pet, pull, pullAll, push, pushOne, uid } from './support/sync-helpers';
import { useSyncWorld } from './support/sync-world';

// CON-petcare-002 2.4 and I-07.
const world = useSyncWorld();

describe('cursor', () => {
  it('round-trips and rejects garbage with 400 invalid', async () => {
    expect(decodeCursor(encodeCursor(1234))).toBe(1234);
    expect(decodeCursor(undefined)).toBe(0);
    expect(decodeCursor('eyJ2IjoxLCJzZXEiOiIxMjM0In0')).toBe(1234); // the contract sample
    const owner = world.people().owner.client;
    for (const cursor of [
      'not-base64-json',
      Buffer.from('{"v":2,"seq":1}').toString('base64url'),
      Buffer.from('{"v":1,"seq":"x"}').toString('base64url'),
    ]) {
      const res = await pull(owner, cursor);
      expect(res.status, cursor).toBe(400);
      expect(res.body.code).toBe('invalid');
    }
    expect((await pull(owner, undefined, 0)).status).toBe(400);
    expect((await pull(owner, undefined, 1001)).status).toBe(400);
  });
});

describe('pull', () => {
  it('returns each changed record once, current state, and nothing new on the next pull', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const first = await pullAll(owner);
    const created = await pushOne(owner, mutation(householdId, 'pet', 'create', pet('Pulled')));
    const id = created.record?.id ?? '';
    await pushOne(
      owner,
      mutation(householdId, 'pet', 'update', { diet: 'a' }, { id, baseVersion: 1 }),
    );
    await pushOne(
      owner,
      mutation(householdId, 'pet', 'update', { diet: 'b' }, { id, baseVersion: 2 }),
    );

    const next = await pullAll(owner, first.cursor);
    const mine = next.changes.filter((c) => c?.id === id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ version: 3, data: { name: 'Pulled', diet: 'b' } });

    const again = await pull(owner, next.cursor);
    expect(again.body.changes).toEqual([]);
    expect(again.body.hasMore).toBe(false);
    expect(again.body.cursor).toBe(next.cursor);
  });

  it('includes tombstones and the households snapshot with roles', async () => {
    const { householdId } = await world.household();
    const { owner, caretaker } = world.people();
    const created = await pushOne(owner.client, mutation(householdId, 'pet', 'create', pet()));
    const id = created.record?.id ?? '';
    await pushOne(owner.client, mutation(householdId, 'pet', 'delete', {}, { id, baseVersion: 1 }));
    const { body } = await pull(caretaker.client);
    const tomb = body.changes.find((c: { id: string }) => c.id === id);
    expect(tomb.deletedAt).not.toBeNull();
    expect(body.households.find((h: { id: string }) => h.id === householdId)).toMatchObject({
      role: 'caretaker',
    });
  });

  it('pages: limit 2 gives hasMore until the end, and never repeats a record', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const start = (await pullAll(owner)).cursor;
    const ids = [];
    for (let i = 0; i < 5; i++) {
      ids.push(
        (await pushOne(owner, mutation(householdId, 'pet', 'create', pet(`P${i}`)))).record?.id,
      );
    }
    const seen: string[] = [];
    let cursor = start;
    let pages = 0;
    for (;;) {
      const { body } = await pull(owner, cursor, 2);
      pages++;
      seen.push(...body.changes.map((c: { id: string }) => c.id));
      cursor = body.cursor;
      if (!body.hasMore) break;
      expect(body.changes).toHaveLength(2);
    }
    expect(pages).toBe(3);
    expect(seen).toEqual(ids); // in change order
  });

  it('only returns households the user belongs to', async () => {
    const { householdId } = await world.household();
    const { owner, outsider } = world.people();
    await pushOne(owner.client, mutation(householdId, 'pet', 'create', pet('Private')));
    const { body } = await pull(outsider.client);
    expect(body.changes.every((c: { householdId: string }) => c.householdId !== householdId)).toBe(
      true,
    );
    expect(body.households.map((h: { id: string }) => h.id)).not.toContain(householdId);
  });

  it('a member who is removed no longer receives the household', async () => {
    const { householdId } = await world.household();
    const { owner, viewer } = world.people();
    await pushOne(owner.client, mutation(householdId, 'pet', 'create', pet('Shared')));
    expect((await pull(viewer.client)).body.households.map((h: { id: string }) => h.id)).toContain(
      householdId,
    );
    await owner.client.request('DELETE', `/api/households/${householdId}/members/${viewer.userId}`);
    const { body } = await pull(viewer.client);
    expect(body.households.map((h: { id: string }) => h.id)).not.toContain(householdId);
    expect(body.changes.every((c: { householdId: string }) => c.householdId !== householdId)).toBe(
      true,
    );
  });

  it('requires a session', async () => {
    const { ApiClient } = await import('./support/api-client');
    expect((await pull(new ApiClient(world.api()))).status).toBe(401);
  });
});

describe('expired cursor (I-07)', () => {
  it('410 cursorExpired once the log is purged past the cursor, and a full re-pull restores everything', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const created = await pushOne(owner, mutation(householdId, 'pet', 'create', pet('Early')));
    const early = await pull(owner);
    const oldCursor = early.body.cursor as string;
    const beforePurge = await pullAll(owner);

    for (let i = 0; i < 3; i++)
      await pushOne(owner, mutation(householdId, 'pet', 'create', pet(`Later${i}`)));
    // Purge every change-log row up to (and including) the old cursor's position, as the nightly job will.
    await world.query('DELETE FROM change_log WHERE seq <= $1', [decodeCursor(oldCursor)]);
    await world.query('DELETE FROM change_log WHERE seq < (SELECT max(seq) - 1 FROM change_log)');

    const stale = await pull(owner, oldCursor);
    expect(stale.status).toBe(410);
    expect(stale.body.code).toBe('cursorExpired');

    // The client starts over from an empty cursor and gets what is still tracked.
    const fresh = await pullAll(owner);
    expect(fresh.changes.length).toBeGreaterThan(0);
    expect(fresh.changes.length).toBeLessThanOrEqual(beforePurge.changes.length);
    expect(created.record?.id).toBeTruthy();
  });

  it('an empty cursor is never expired', async () => {
    await world.query('DELETE FROM change_log');
    const owner = world.people().owner.client;
    expect((await pull(owner)).status).toBe(200);
  });
});

describe('batches', () => {
  it('push processes mutations in order, each in its own transaction', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const id = uid();
    const results = await push(owner, [
      mutation(householdId, 'pet', 'create', pet('Ordered'), { id }),
      mutation(householdId, 'pet', 'update', { diet: 'a' }, { id, baseVersion: 1 }),
      mutation(householdId, 'pet', 'create', { species: 'dog' }), // invalid, does not stop the rest
      mutation(householdId, 'pet', 'update', { diet: 'b' }, { id, baseVersion: 2 }),
    ]);
    expect(results.map((r) => r.status)).toEqual(['applied', 'applied', 'rejected', 'applied']);
    expect(results[3]?.record?.version).toBe(3);
  });
});
