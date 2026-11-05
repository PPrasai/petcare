import { describe, expect, it } from 'vitest';
import { validData } from './support/record-fixtures';
import { mutation, pet, pushOne, uid } from './support/sync-helpers';
import { useSyncWorld } from './support/sync-world';

// CON-petcare-002 2.3 step 3: validation, references and uniqueness.
const world = useSyncWorld();

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
