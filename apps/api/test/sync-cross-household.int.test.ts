import { describe, expect, it } from 'vitest';
import { mutation, pet, pushOne, uid } from './support/sync-helpers';
import { useSyncWorld } from './support/sync-world';

// CON-petcare-002 I-14 (ISS-CON2-01): a mutation whose householdId differs from the existing
// record's household is rejected notFound, for every op. The attacker owns H1 and is a viewer
// in H2.
const world = useSyncWorld();

async function setup() {
  const { owner, caretaker } = world.people();
  // H1 belongs to the caretaker (so the caretaker is its owner); H2 belongs to the owner,
  // with the caretaker as a mere viewer.
  const h1 = (await caretaker.client.post('/api/households', { name: 'Attacker home' })).json()
    .id as string;
  const h2 = (await world.household()).householdId;
  await world.query(
    "UPDATE memberships SET role = 'viewer' WHERE household_id = $1 AND user_id = $2",
    [h2, caretaker.userId],
  );
  await world.api().forgetMemberships(caretaker.userId);
  const victim = await pushOne(owner.client, mutation(h2, 'pet', 'create', pet('Victim')));
  return { h1, h2, victimId: victim.record?.id ?? '', attacker: caretaker.client };
}

describe('cross-household targeting (I-14)', () => {
  for (const op of ['update', 'delete', 'create'] as const) {
    it(`${op} of an H2 record with householdId H1 is rejected notFound and changes nothing`, async () => {
      const { h1, h2, victimId, attacker } = await setup();
      const fields = op === 'delete' ? {} : op === 'create' ? pet('Hijack') : { name: 'Hijacked' };
      const result = await pushOne(
        attacker,
        mutation(h1, 'pet', op, fields, { id: victimId, baseVersion: 1 }),
      );
      expect(result.status).toBe('rejected');
      expect(result.error?.code).toBe('notFound');
      expect(result.record).toBeUndefined();
      const rows = await world.query<{
        name: string;
        household_id: string;
        version: number;
        deleted_at: Date | null;
      }>('SELECT name, household_id, version, deleted_at FROM pets WHERE id = $1', [victimId]);
      expect(rows[0]).toMatchObject({
        name: 'Victim',
        household_id: h2,
        version: 1,
        deleted_at: null,
      });
    });
  }

  it('the attacker is also refused with the real household id (a viewer cannot write)', async () => {
    const { h2, victimId, attacker } = await setup();
    const result = await pushOne(
      attacker,
      mutation(h2, 'pet', 'update', { name: 'Hijacked' }, { id: victimId, baseVersion: 1 }),
    );
    expect(result.error?.code).toBe('forbidden');
  });

  it('an unknown household is notFound', async () => {
    const owner = world.people().owner.client;
    const result = await pushOne(owner, mutation(uid(), 'pet', 'create', pet()));
    expect(result.error?.code).toBe('notFound');
  });
});
