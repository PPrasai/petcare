import { describe, expect, it } from 'vitest';
import { mutation, pet, pushOne } from './support/sync-helpers';
import { useSyncWorld } from './support/sync-world';

// Found by the QA-01 perf run: a push that looked up the caller's role while its transaction held
// a pooled connection needed a second connection on a cache miss. With more concurrent pushes
// than pool connections (10), every connection waited for another and the API stopped answering.
const world = useSyncWorld();

describe('concurrent pushes with a cold membership cache', () => {
  it('all complete when there are more pushes than pooled connections', async () => {
    const { owner } = world.people();
    const { householdId } = await world.household();
    await world.api().forgetMemberships(owner.userId);
    const results = await Promise.all(
      Array.from({ length: 30 }, (_, n) =>
        pushOne(owner.client, mutation(householdId, 'pet', 'create', pet(`Pet ${n}`))),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(30).fill('applied'));
  }, 30_000);
});
