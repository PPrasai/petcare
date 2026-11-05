import { describe, expect, it } from 'vitest';
import { entities } from '@petcare/domain';
import { ALL_TYPES, validData } from './support/record-fixtures';
import { mutation, pet, pull, pushOne, uid } from './support/sync-helpers';
import { useSyncWorld } from './support/sync-world';

// CON-petcare-002 I-08: deleting a pet tombstones every dependent record and disables its
// public emergency link.
const world = useSyncWorld();

describe('pet delete cascade (I-08)', () => {
  it('tombstones every record that belongs to the pet, each with its own version and log row', async () => {
    const { householdId, refs } = await world.household();
    const owner = world.people().owner.client;
    const petId = uid();
    await pushOne(owner, mutation(householdId, 'pet', 'create', pet('Cascade'), { id: petId }));

    // One record of every type that carries a petId, all pointing at this pet.
    const dependents: { type: string; id: string }[] = [];
    for (const type of ALL_TYPES) {
      const entity = entities.find((e) => e.type === type);
      if (
        !entity ||
        type === 'pet' ||
        !('petId' in (entity.schema as never as { shape: object }).shape)
      )
        continue;
      const data = { ...validData(type, refs, petId), petId };
      const result = await pushOne(owner, mutation(householdId, type, 'create', data));
      expect(result.status, `${type}: ${JSON.stringify(result.error)}`).toBe('applied');
      dependents.push({ type, id: result.record?.id ?? '' });
    }
    expect(dependents.length).toBeGreaterThanOrEqual(12);

    // A record of the same type for another pet must be untouched.
    const otherPet = uid();
    await pushOne(
      owner,
      mutation(householdId, 'pet', 'create', pet('Bystander'), { id: otherPet }),
    );
    const bystander = await pushOne(
      owner,
      mutation(householdId, 'condition', 'create', { ...validData('condition', refs, otherPet) }),
    );

    const del = await pushOne(
      owner,
      mutation(householdId, 'pet', 'delete', {}, { id: petId, baseVersion: 1 }),
    );
    expect(del.status).toBe('applied');

    const { body } = await pull(owner);
    const byId = new Map(body.changes.map((c: { id: string }) => [c.id, c]));
    for (const { type, id } of dependents) {
      const record = byId.get(id) as { deletedAt: string | null; version: number } | undefined;
      expect(record?.deletedAt, `${type} should be a tombstone`).not.toBeNull();
      expect(record?.version, `${type} version`).toBe(2);
      const log = await world.query<{ op: string }>(
        'SELECT op FROM change_log WHERE record_id = $1 ORDER BY version',
        [id],
      );
      expect(
        log.map((l) => l.op),
        type,
      ).toEqual(['create', 'delete']);
    }
    const kept = byId.get(bystander.record?.id ?? '') as { deletedAt: string | null } | undefined;
    expect(kept?.deletedAt).toBeNull();
  });

  it('removes the public emergency link at once', async () => {
    const { householdId, refs } = await world.household();
    const owner = world.people().owner.client;
    const petId = uid();
    await pushOne(owner, mutation(householdId, 'pet', 'create', pet('Lost'), { id: petId }));
    const card = await pushOne(
      owner,
      mutation(householdId, 'emergencyCard', 'create', validData('emergencyCard', refs, petId)),
    );
    const cardId = card.record?.id ?? '';
    // The link-creating endpoint arrives in slice 14; here the row is inserted directly.
    await world.query(
      "INSERT INTO emergency_tokens (card_id, token_hash) VALUES ($1, decode('aa', 'hex'))",
      [cardId],
    );

    await pushOne(owner, mutation(householdId, 'pet', 'delete', {}, { id: petId, baseVersion: 1 }));
    const tokens = await world.query('SELECT 1 FROM emergency_tokens WHERE card_id = $1', [cardId]);
    expect(tokens).toHaveLength(0);
  });

  it('is atomic: a failed delete leaves the dependents alone', async () => {
    const { householdId, refs } = await world.household();
    const { caretaker } = world.people();
    // A caretaker may not delete pets, so nothing cascades.
    const result = await pushOne(
      caretaker.client,
      mutation(householdId, 'pet', 'delete', {}, { id: refs.petId, baseVersion: 1 }),
    );
    expect(result.error?.code).toBe('forbidden');
    const rows = await world.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM measurements WHERE pet_id = $1 AND deleted_at IS NOT NULL',
      [refs.petId],
    );
    expect(rows[0]?.n).toBe(0);
  });
});
