import { describe, expect, it } from 'vitest';
import { updateFor, validData } from './support/record-fixtures';
import { mutation, pet, push, pushOne, uid } from './support/sync-helpers';
import { useSyncWorld } from './support/sync-world';

// CON-petcare-002 2.3: the push algorithm, one rule at a time.
const world = useSyncWorld();

describe('create', () => {
  it('inserts at version 1 stamped with the actor, and returns the full envelope', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner;
    const m = mutation(householdId, 'pet', 'create', {
      name: 'Momo',
      species: 'dog',
      breed: 'Terrier',
    });
    const result = await pushOne(owner.client, m);
    expect(result.status).toBe('applied');
    expect(result.record).toMatchObject({
      id: m.id,
      type: 'pet',
      householdId,
      version: 1,
      createdBy: owner.userId,
      updatedBy: owner.userId,
      deletedAt: null,
    });
    expect(result.record?.data).toMatchObject({ name: 'Momo', species: 'dog', breed: 'Terrier' });
  });

  it('creating an existing id in the same household is an update with baseVersion 0', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const id = uid();
    await pushOne(owner, mutation(householdId, 'pet', 'create', pet('Momo'), { id }));
    // A retry of a lost response arrives under a new mutationId, with the same content: no-op.
    const retry = await pushOne(owner, mutation(householdId, 'pet', 'create', pet('Momo'), { id }));
    expect(retry.status).toBe('applied');
    expect(retry.record?.version).toBe(1);
    // With different content it updates (and the earlier value is kept as a conflict).
    const changed = await pushOne(
      owner,
      mutation(householdId, 'pet', 'create', pet('Momo II'), { id }),
    );
    expect(changed.record?.version).toBe(2);
    expect(changed.record?.data.name).toBe('Momo II');
    expect(changed.status).toBe('merged');
  });

  it('every record type can be created with valid data', async () => {
    const { householdId, refs } = await world.household();
    const owner = world.people().owner.client;
    for (const type of Object.keys(updateFor).concat([
      'medicationDose',
      'careCompletion',
      'reminderCompletion',
      'reminderSnooze',
    ])) {
      const result = await pushOne(
        owner,
        mutation(householdId, type, 'create', validData(type as never, refs)),
      );
      expect(result.status, `${type}: ${JSON.stringify(result.error)}`).toBe('applied');
    }
  });
});

describe('append-only records', () => {
  it('rejects an update with appendOnlyUpdate, even from the owner', async () => {
    const { householdId, refs } = await world.household();
    const owner = world.people().owner.client;
    const dose = await pushOne(
      owner,
      mutation(householdId, 'medicationDose', 'create', validData('medicationDose', refs)),
    );
    const update = await pushOne(
      owner,
      mutation(
        householdId,
        'medicationDose',
        'update',
        { skipped: true },
        { id: dose.record?.id ?? '', baseVersion: 1 },
      ),
    );
    expect(update.status).toBe('rejected');
    expect(update.error?.code).toBe('appendOnlyUpdate');
  });

  it('keeps two doses for the same occurrence from two people', async () => {
    const { householdId, refs } = await world.household();
    const { owner, caretaker } = world.people();
    const data = validData('medicationDose', refs);
    const [a] = await push(owner.client, [mutation(householdId, 'medicationDose', 'create', data)]);
    const [b] = await push(caretaker.client, [
      mutation(householdId, 'medicationDose', 'create', data),
    ]);
    expect(a?.status).toBe('applied');
    expect(b?.status).toBe('applied');
    const rows = await world.query(
      'SELECT count(*)::int AS n FROM medication_doses WHERE medication_id = $1',
      [refs.medicationId],
    );
    expect(rows[0]?.n).toBe(2);
  });

  it('a repeated create of the same dose id is a no-op, and a dose can be deleted', async () => {
    const { householdId, refs } = await world.household();
    const owner = world.people().owner.client;
    const id = uid();
    const data = validData('medicationDose', refs);
    await pushOne(owner, mutation(householdId, 'medicationDose', 'create', data, { id }));
    const again = await pushOne(
      owner,
      mutation(householdId, 'medicationDose', 'create', data, { id }),
    );
    expect(again.status).toBe('applied');
    expect(again.record?.version).toBe(1);
    const del = await pushOne(
      owner,
      mutation(householdId, 'medicationDose', 'delete', {}, { id, baseVersion: 1 }),
    );
    expect(del.record?.deletedAt).not.toBeNull();
  });
});

describe('update', () => {
  it('changes only the given fields, bumps the version by one and stamps the actor', async () => {
    const { householdId } = await world.household();
    const { owner, caretaker } = world.people();
    const created = await pushOne(
      owner.client,
      mutation(householdId, 'pet', 'create', { ...pet(), breed: 'Terrier' }),
    );
    const id = created.record?.id ?? '';
    const updated = await pushOne(
      caretaker.client,
      mutation(householdId, 'pet', 'update', { diet: 'wet food' }, { id, baseVersion: 1 }),
    );
    expect(updated.status).toBe('applied');
    expect(updated.record).toMatchObject({
      version: 2,
      createdBy: owner.userId,
      updatedBy: caretaker.userId,
    });
    expect(updated.record?.data).toMatchObject({
      name: 'Momo',
      breed: 'Terrier',
      diet: 'wet food',
    });
  });

  it('an update that changes nothing returns the record without a version bump', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const created = await pushOne(owner, mutation(householdId, 'pet', 'create', pet('Same')));
    const id = created.record?.id ?? '';
    const noop = await pushOne(
      owner,
      mutation(householdId, 'pet', 'update', { name: 'Same' }, { id, baseVersion: 1 }),
    );
    expect(noop.status).toBe('applied');
    expect(noop.record?.version).toBe(1);
    const log = await world.query(
      'SELECT count(*)::int AS n FROM change_log WHERE record_id = $1',
      [id],
    );
    expect(log[0]?.n).toBe(1);
  });

  it('applies updates to every mergeable type', async () => {
    const { householdId, refs } = await world.household();
    const owner = world.people().owner.client;
    for (const [type, fields] of Object.entries(updateFor)) {
      const created = await pushOne(
        owner,
        mutation(householdId, type, 'create', validData(type as never, refs)),
      );
      const updated = await pushOne(
        owner,
        mutation(householdId, type, 'update', fields as Record<string, unknown>, {
          id: created.record?.id ?? '',
          baseVersion: 1,
        }),
      );
      expect(updated.status, `${type}: ${JSON.stringify(updated.error)}`).toBe('applied');
      expect(updated.record?.version, type).toBe(2);
    }
  });

  it('updating a record that does not exist is notFound', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const result = await pushOne(
      owner,
      mutation(householdId, 'pet', 'update', { diet: 'x' }, { baseVersion: 1 }),
    );
    expect(result.error?.code).toBe('notFound');
    const del = await pushOne(owner, mutation(householdId, 'pet', 'delete', {}));
    expect(del.error?.code).toBe('notFound');
  });
});

describe('delete', () => {
  it('leaves a tombstone with its data, bumps the version, and is idempotent', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const created = await pushOne(
      owner,
      mutation(householdId, 'contact', 'create', { name: 'Dr. Gone', role: 'vet' }),
    );
    const id = created.record?.id ?? '';
    const del = await pushOne(
      owner,
      mutation(householdId, 'contact', 'delete', {}, { id, baseVersion: 1 }),
    );
    expect(del.status).toBe('applied');
    expect(del.record?.version).toBe(2);
    expect(del.record?.deletedAt).not.toBeNull();
    expect(del.record?.data.name).toBe('Dr. Gone');
    const again = await pushOne(
      owner,
      mutation(householdId, 'contact', 'delete', {}, { id, baseVersion: 2 }),
    );
    expect(again.status).toBe('applied');
    expect(again.record?.version).toBe(2);
  });
});
