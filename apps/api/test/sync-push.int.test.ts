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

describe('validation', () => {
  it('rejects data that breaks the schema, with the JSON pointer', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const bad = await pushOne(
      owner,
      mutation(householdId, 'pet', 'create', { name: 'x', species: 'dragon' }),
    );
    expect(bad.status).toBe('rejected');
    expect(bad.error).toMatchObject({ code: 'invalid', path: '/species' });
    const unknown = await pushOne(
      owner,
      mutation(householdId, 'pet', 'create', { ...pet(), nope: 1 }),
    );
    expect(unknown.error?.code).toBe('invalid');
    const missing = await pushOne(
      owner,
      mutation(householdId, 'pet', 'create', { species: 'dog' }),
    );
    expect(missing.error?.code).toBe('invalid');
  });

  it('validates the merged result of an update', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const created = await pushOne(owner, mutation(householdId, 'pet', 'create', pet()));
    const bad = await pushOne(
      owner,
      mutation(
        householdId,
        'pet',
        'update',
        { name: '' },
        { id: created.record?.id ?? '', baseVersion: 1 },
      ),
    );
    expect(bad.status).toBe('rejected');
    expect(bad.error).toMatchObject({ code: 'invalid', path: '/name' });
  });

  it('money as a float and a non-UTC instant are invalid', async () => {
    const { householdId, refs } = await world.household();
    const owner = world.people().owner.client;
    const float = await pushOne(
      owner,
      mutation(householdId, 'expense', 'create', {
        ...validData('expense', refs),
        amountMinor: 10.5,
      }),
    );
    expect(float.error?.code).toBe('invalid');
    const local = await pushOne(
      owner,
      mutation(householdId, 'measurement', 'create', {
        ...validData('measurement', refs),
        measuredAt: '2026-06-01T09:00:00+02:00',
      }),
    );
    expect(local.error?.code).toBe('invalid');
  });

  it('rejects references to records that do not exist, are deleted, or are in another household', async () => {
    const { householdId, refs } = await world.household();
    const other = await world.household();
    const owner = world.people().owner.client;
    const noPet = await pushOne(
      owner,
      mutation(householdId, 'vaccination', 'create', {
        ...validData('vaccination', refs),
        petId: uid(),
      }),
    );
    expect(noPet.error).toMatchObject({ code: 'invalidReference', path: '/petId' });
    const foreignPet = await pushOne(
      owner,
      mutation(householdId, 'vaccination', 'create', {
        ...validData('vaccination', refs),
        petId: other.refs.petId,
      }),
    );
    expect(foreignPet.error).toMatchObject({ code: 'invalidReference', path: '/petId' });
    const noContact = await pushOne(
      owner,
      mutation(householdId, 'vaccination', 'create', {
        ...validData('vaccination', refs),
        contactId: uid(),
      }),
    );
    expect(noContact.error?.path).toBe('/contactId');

    const doomed = uid();
    await pushOne(
      owner,
      mutation(householdId, 'contact', 'create', { name: 'Gone', role: 'vet' }, { id: doomed }),
    );
    await pushOne(
      owner,
      mutation(householdId, 'contact', 'delete', {}, { id: doomed, baseVersion: 1 }),
    );
    const deletedRef = await pushOne(
      owner,
      mutation(householdId, 'vaccination', 'create', {
        ...validData('vaccination', refs),
        contactId: doomed,
      }),
    );
    expect(deletedRef.error?.code).toBe('invalidReference');
  });

  it('rejects an unknown file id, a file from another household and checks file arrays', async () => {
    const { householdId, refs } = await world.household();
    const other = await world.household();
    const owner = world.people().owner.client;
    const unknown = await pushOne(
      owner,
      mutation(householdId, 'document', 'create', {
        ...validData('document', refs),
        fileId: uid(),
      }),
    );
    expect(unknown.error).toMatchObject({ code: 'invalidReference', path: '/fileId' });
    const foreign = await pushOne(
      owner,
      mutation(householdId, 'document', 'create', {
        ...validData('document', refs),
        fileId: other.refs.fileId,
      }),
    );
    expect(foreign.error?.code).toBe('invalidReference');
    const array = await pushOne(
      owner,
      mutation(householdId, 'vetVisit', 'create', {
        ...validData('vetVisit', refs),
        fileIds: [refs.fileId, uid()],
      }),
    );
    expect(array.error).toMatchObject({ code: 'invalidReference', path: '/fileIds' });
    const ok = await pushOne(
      owner,
      mutation(householdId, 'vetVisit', 'create', {
        ...validData('vetVisit', refs),
        fileIds: [refs.fileId],
      }),
    );
    expect(ok.status).toBe('applied');
  });

  it('a snooze must point at a real source and belong to the pushing user', async () => {
    const { householdId, refs } = await world.household();
    const { caretaker, owner } = world.people();
    const base = validData('reminderSnooze', refs);
    const wrongUser = await pushOne(
      caretaker.client,
      mutation(householdId, 'reminderSnooze', 'create', base),
    );
    expect(wrongUser.error).toMatchObject({ code: 'forbidden', path: '/userId' });
    const noSource = await pushOne(
      owner.client,
      mutation(householdId, 'reminderSnooze', 'create', { ...base, sourceId: uid() }),
    );
    expect(noSource.error).toMatchObject({ code: 'invalidReference', path: '/sourceId' });
    const mismatched = await pushOne(
      owner.client,
      mutation(householdId, 'reminderSnooze', 'create', { ...base, sourceType: 'medication' }),
    );
    expect(mismatched.error?.code).toBe('invalidReference');
    const ok = await pushOne(owner.client, mutation(householdId, 'reminderSnooze', 'create', base));
    expect(ok.status).toBe('applied');
  });

  it('allows one emergency card per pet', async () => {
    const { householdId, refs } = await world.household();
    const owner = world.people().owner.client;
    const data = validData('emergencyCard', refs);
    const first = await pushOne(owner, mutation(householdId, 'emergencyCard', 'create', data));
    expect(first.status).toBe('applied');
    const second = await pushOne(owner, mutation(householdId, 'emergencyCard', 'create', data));
    expect(second.error).toMatchObject({ code: 'duplicate', path: '/petId' });
    // after the first is deleted, a new one is fine
    await pushOne(
      owner,
      mutation(
        householdId,
        'emergencyCard',
        'delete',
        {},
        { id: first.record?.id ?? '', baseVersion: 1 },
      ),
    );
    const third = await pushOne(owner, mutation(householdId, 'emergencyCard', 'create', data));
    expect(third.status).toBe('applied');
  });

  it('refuses fields larger than 64 KiB as tooLarge', async () => {
    const { householdId, refs } = await world.household();
    const owner = world.people().owner.client;
    const result = await pushOne(
      owner,
      mutation(householdId, 'pet', 'create', { ...pet(), diet: 'x'.repeat(70_000) }),
    );
    expect(result.error?.code).toBe('tooLarge');
    void refs;
  });

  it('rejects a malformed batch with HTTP 400 and applies nothing', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const good = mutation(householdId, 'pet', 'create', pet());
    const res = await owner.post('/api/sync/push', {
      clientId: uid(),
      mutations: [good, { nonsense: true }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('invalid');
    expect(
      (await owner.get('/api/sync/pull'))
        .json()
        .changes.some((c: { id: string }) => c.id === good.id),
    ).toBe(false);
    const empty = await owner.post('/api/sync/push', { clientId: uid(), mutations: [] });
    expect(empty.statusCode).toBe(400);
    const tooMany = await owner.post('/api/sync/push', {
      clientId: uid(),
      mutations: Array.from({ length: 101 }, () => mutation(householdId, 'pet', 'create', pet())),
    });
    expect(tooMany.statusCode).toBe(400);
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
