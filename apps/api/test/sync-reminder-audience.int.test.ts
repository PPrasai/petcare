import { describe, expect, it } from 'vitest';
import { mutation, pushOne, uid } from './support/sync-helpers';
import { useSyncWorld } from './support/sync-world';

// CON-petcare-003 I-16: audienceUserId (and the other new reminder fields) on push.
const world = useSyncWorld();
const schedule = { tz: 'UTC', kind: 'daily', startOn: '2026-01-01', times: ['08:00'] };
const base = { title: 'Walk', schedule, active: true };

describe('reminder audience (I-16)', () => {
  it('accepts yearly, notBefore, category and an audience that is the actor', async () => {
    const { householdId } = await world.household();
    const { caretaker } = world.people();
    const result = await pushOne(
      caretaker.client,
      mutation(householdId, 'reminder', 'create', {
        ...base,
        schedule: { ...schedule, kind: 'yearly', notBefore: '2026-06-01T00:00:00Z' },
        category: 'vetVisit',
        audienceUserId: caretaker.userId,
      }),
    );
    expect(result.status, JSON.stringify(result.error)).toBe('applied');
    expect(result.record?.data).toMatchObject({
      category: 'vetVisit',
      audienceUserId: caretaker.userId,
      schedule: { kind: 'yearly', notBefore: '2026-06-01T00:00:00Z' },
    });
  });

  it('rejects an unknown category as invalid', async () => {
    const { householdId } = await world.household();
    const result = await pushOne(
      world.people().owner.client,
      mutation(householdId, 'reminder', 'create', { ...base, category: 'play' }),
    );
    expect(result.error?.code).toBe('invalid');
  });

  it('rejects someone else as the audience, on create and on update', async () => {
    const { householdId, refs } = await world.household();
    const { owner, caretaker } = world.people();
    const create = await pushOne(
      owner.client,
      mutation(householdId, 'reminder', 'create', { ...base, audienceUserId: caretaker.userId }),
    );
    expect(create.error?.code).toBe('forbidden');
    const update = await pushOne(
      owner.client,
      mutation(
        householdId,
        'reminder',
        'update',
        { audienceUserId: caretaker.userId },
        { id: refs.reminderId, baseVersion: 1 },
      ),
    );
    expect(update.error?.code).toBe('forbidden');
  });

  it('refuses an id that is not a member', async () => {
    // The actor-only rule (step 2) answers first, so a non-member id is "forbidden".
    const { householdId } = await world.household();
    const result = await pushOne(
      world.people().owner.client,
      mutation(householdId, 'reminder', 'create', {
        ...base,
        audienceUserId: world.people().outsider.userId,
      }),
    );
    expect(result.status).toBe('rejected');
    expect(['forbidden', 'invalidReference']).toContain(result.error?.code);
  });

  it('lets an editing role set Just me for itself and clear it back to everyone', async () => {
    const { householdId } = await world.household();
    const { caretaker, owner } = world.people();
    const id = uid();
    await pushOne(
      owner.client,
      mutation(
        householdId,
        'reminder',
        'create',
        { ...base, audienceUserId: owner.userId },
        { id },
      ),
    );
    const cleared = await pushOne(
      caretaker.client,
      mutation(householdId, 'reminder', 'update', { audienceUserId: null }, { id, baseVersion: 1 }),
    );
    expect(cleared.status, JSON.stringify(cleared.error)).toBe('applied');
    expect(cleared.record?.data.audienceUserId).toBeUndefined();
    const mine = await pushOne(
      caretaker.client,
      mutation(
        householdId,
        'reminder',
        'update',
        { audienceUserId: caretaker.userId },
        { id, baseVersion: 2 },
      ),
    );
    expect(mine.status).toBe('applied');
    expect(mine.record?.data.audienceUserId).toBe(caretaker.userId);
  });

  it('a viewer still cannot write', async () => {
    const { householdId } = await world.household();
    const viewer = world.people().viewer;
    const result = await pushOne(
      viewer.client,
      mutation(householdId, 'reminder', 'create', { ...base, audienceUserId: viewer.userId }),
    );
    expect(result.error?.code).toBe('forbidden');
  });
});
