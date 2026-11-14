import { describe, expect, it } from 'vitest';
import { mutation, pull, pushOne, uid } from './support/sync-helpers';
import { useSyncWorld } from './support/sync-world';

// CON-petcare-003 I-15: careLog per-kind rules and append-only; mealPreset round-trips.
const world = useSyncWorld();
const at = '2026-06-01T09:00:00Z';

describe('careLog (I-15)', () => {
  const valid = (petId: string): [string, Record<string, unknown>][] => [
    [
      'meal',
      {
        petId,
        kind: 'meal',
        occurredAt: at,
        foodName: 'Kibble',
        quantity: 1.5,
        quantityUnit: 'cup',
      },
    ],
    ['meal without quantity', { petId, kind: 'meal', occurredAt: at, foodName: 'Treat' }],
    ['walk', { petId, kind: 'walk', occurredAt: at, durationMin: 30, note: 'park' }],
    ['grooming', { petId, kind: 'grooming', occurredAt: at, groomingTasks: ['bath', 'ears'] }],
    [
      'medication',
      {
        petId,
        kind: 'medication',
        occurredAt: at,
        medicationName: 'Pill',
        route: 'oral',
        doseText: '1 tab',
      },
    ],
  ];

  it('accepts each kind, and a pull returns it exactly as written', async () => {
    const { householdId, refs } = await world.household();
    const owner = world.people().owner.client;
    for (const [label, fields] of valid(refs.petId)) {
      const result = await pushOne(owner, mutation(householdId, 'careLog', 'create', fields));
      expect(result.status, `${label}: ${JSON.stringify(result.error)}`).toBe('applied');
      expect(result.record?.data, label).toEqual(fields);
    }
    const { body } = await pull(world.people().caretaker.client);
    const logs = (body.changes as { type: string; data: Record<string, unknown> }[]).filter(
      (c) => c.type === 'careLog' && c.data.petId === refs.petId,
    );
    expect(logs).toHaveLength(5);
    // grooming_tasks is NOT NULL in the table, but a non-grooming log never shows it.
    expect(logs.filter((l) => 'groomingTasks' in l.data)).toHaveLength(1);
  });

  it('rejects data that breaks the per-kind table', async () => {
    const { householdId, refs } = await world.household();
    const owner = world.people().owner.client;
    const petId = refs.petId;
    const bad: [string, Record<string, unknown>][] = [
      [
        'meal with durationMin',
        { petId, kind: 'meal', occurredAt: at, foodName: 'x', durationMin: 5 },
      ],
      ['walk without duration', { petId, kind: 'walk', occurredAt: at }],
      [
        'quantity without unit',
        { petId, kind: 'meal', occurredAt: at, foodName: 'x', quantity: 1 },
      ],
      ['empty tasks', { petId, kind: 'grooming', occurredAt: at, groomingTasks: [] }],
      ['walk with food', { petId, kind: 'walk', occurredAt: at, durationMin: 5, foodName: 'x' }],
      [
        'unit ml',
        { petId, kind: 'meal', occurredAt: at, foodName: 'x', quantity: 1, quantityUnit: 'ml' },
      ],
    ];
    for (const [label, fields] of bad) {
      const result = await pushOne(owner, mutation(householdId, 'careLog', 'create', fields));
      expect(result.status, label).toBe('rejected');
      expect(result.error?.code, label).toBe('invalid');
    }
  });

  it('rejects an update with appendOnlyUpdate and lets a delete through (Undo)', async () => {
    const { householdId, refs } = await world.household();
    const owner = world.people().owner.client;
    const id = uid();
    const fields = { petId: refs.petId, kind: 'walk', occurredAt: at, durationMin: 20 };
    await pushOne(owner, mutation(householdId, 'careLog', 'create', fields, { id }));
    const update = await pushOne(
      owner,
      mutation(householdId, 'careLog', 'update', { durationMin: 25 }, { id, baseVersion: 1 }),
    );
    expect(update.error?.code).toBe('appendOnlyUpdate');
    const del = await pushOne(
      owner,
      mutation(householdId, 'careLog', 'delete', {}, { id, baseVersion: 1 }),
    );
    expect(del.status).toBe('applied');
    expect(del.record?.deletedAt).not.toBeNull();
  });

  it('checks the pet and the medication reference', async () => {
    const { householdId, refs } = await world.household();
    const owner = world.people().owner.client;
    const noPet = await pushOne(
      owner,
      mutation(householdId, 'careLog', 'create', {
        petId: uid(),
        kind: 'walk',
        occurredAt: at,
        durationMin: 5,
      }),
    );
    expect(noPet.error?.code).toBe('invalidReference');
    const base = { petId: refs.petId, kind: 'medication', occurredAt: at, medicationName: 'Pill' };
    const noMed = await pushOne(
      owner,
      mutation(householdId, 'careLog', 'create', { ...base, medicationId: uid() }),
    );
    expect(noMed.error?.code).toBe('invalidReference');
    const ok = await pushOne(
      owner,
      mutation(householdId, 'careLog', 'create', { ...base, medicationId: refs.medicationId }),
    );
    expect(ok.status).toBe('applied');
  });

  it('is removed with its pet (CON-003 2.3 step 4)', async () => {
    const { householdId } = await world.household();
    const owner = world.people().owner.client;
    const petId = uid();
    await pushOne(
      owner,
      mutation(householdId, 'pet', 'create', { name: 'Gone', species: 'cat' }, { id: petId }),
    );
    const log = mutation(householdId, 'careLog', 'create', {
      petId,
      kind: 'walk',
      occurredAt: at,
      durationMin: 5,
    });
    const preset = mutation(householdId, 'mealPreset', 'create', {
      petId,
      foodName: 'x',
      quantity: 1,
      quantityUnit: 'can',
    });
    await pushOne(owner, log);
    await pushOne(owner, preset);
    await pushOne(owner, mutation(householdId, 'pet', 'delete', {}, { id: petId, baseVersion: 1 }));
    const rows = await world.query<{ deleted_at: Date | null }>(
      'SELECT deleted_at FROM care_logs WHERE id = $1 UNION ALL SELECT deleted_at FROM meal_presets WHERE id = $2',
      [log.id, preset.id],
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.deleted_at !== null)).toBe(true);
  });
});

describe('mealPreset', () => {
  it('stores the quantity in the unit chosen and merges field edits', async () => {
    const { householdId, refs } = await world.household();
    const owner = world.people().owner.client;
    const id = uid();
    const created = await pushOne(
      owner,
      mutation(
        householdId,
        'mealPreset',
        'create',
        { petId: refs.petId, foodName: 'Pouch', quantity: 1, quantityUnit: 'pouch' },
        { id },
      ),
    );
    expect(created.record?.data.quantityUnit).toBe('pouch');
    const updated = await pushOne(
      owner,
      mutation(householdId, 'mealPreset', 'update', { quantity: 2.5 }, { id, baseVersion: 1 }),
    );
    expect(updated.status).toBe('applied');
    expect(updated.record?.data).toMatchObject({ quantity: 2.5, quantityUnit: 'pouch' });
  });
});
