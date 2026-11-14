import { describe, expect, it } from 'vitest';
import { DocumentService } from './document-service';
import { ExpenseService } from './expense-service';
import { HealthService } from './health-service';
import { LogService } from './log-service';
import { MeasurementService } from './measurement-service';
import type { FileGateway } from './ports/file-gateway';
import type { RecordStore, StoredRecord } from './ports/record-store';
import { TodayService } from './today-service';

const PET = '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b';
const CARPROFEN = '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a31';
const HOUSEHOLD = 'h1';
const NOW = new Date('2026-11-09T14:30:00Z');
const prefs = {
  weightUnit: 'kg',
  lengthUnit: 'cm',
  temperatureUnit: 'c',
  timeZone: 'UTC',
  currency: 'USD',
} as const;
const ctx = { userId: 'me', prefs };

function setup() {
  const rows: StoredRecord[] = [];
  const store: RecordStore = {
    list: (type) => Promise.resolve(rows.filter((r) => r.type === type && r.deletedAt === null)),
    get: (type, id) => Promise.resolve(rows.find((r) => r.type === type && r.id === id)),
    create: (type, householdId, data) => {
      const row: StoredRecord = {
        id: `id-${String(rows.length).padStart(3, '0')}`,
        type,
        householdId,
        version: 1,
        createdBy: 'me',
        updatedAt: NOW.toISOString(),
        deletedAt: null,
        pending: true,
        data,
      };
      rows.push(row);
      return Promise.resolve(row);
    },
    createMany: async (householdId, items) => {
      const out: StoredRecord[] = [];
      for (const i of items) out.push(await store.create(i.type, householdId, i.data));
      return out;
    },
    update: () => Promise.reject(new Error('unused')),
    remove: (type, id) => {
      const row = rows.find((r) => r.type === type && r.id === id);
      if (row) row.deletedAt = NOW.toISOString();
      return Promise.resolve();
    },
  };
  const files: FileGateway = {
    attach: () => Promise.resolve({ fileId: '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c' }),
    open: () => Promise.resolve(null),
    release: () => undefined,
    discard: () => Promise.resolve(),
  };
  const service = new LogService(
    new MeasurementService(store),
    new HealthService(store),
    new ExpenseService(store),
    new DocumentService(store),
    files,
    { reduce: () => Promise.resolve(new Blob(['x'])) },
    store,
    new TodayService(store),
  );
  return { rows, service };
}

function seedMedication(rows: StoredRecord[], name: string) {
  const base = {
    householdId: HOUSEHOLD,
    version: 1,
    createdBy: 'me',
    updatedAt: NOW.toISOString(),
    deletedAt: null,
    pending: false,
  };
  rows.push({ ...base, id: PET, type: 'pet', data: { name: 'Momo', species: 'dog' } });
  rows.push({
    ...base,
    id: CARPROFEN,
    type: 'medication',
    data: {
      petId: PET,
      name,
      schedule: { tz: 'UTC', kind: 'daily', startOn: '2026-11-08', times: ['08:00'] },
    },
  });
}

// QA-28 (service part): meals, presets, walks and grooming write the careLog shapes of CON-003.
describe('LogService care logs', () => {
  const meal = {
    petId: PET,
    food: 'Salmon kibble',
    quantity: '300',
    unit: 'g',
    time: '',
    savePreset: true,
  } as const;

  it('logs a meal and saves it as a preset in one write, once', async () => {
    const { rows, service } = setup();
    await service.meal(HOUSEHOLD, meal, prefs, NOW);
    await service.meal(HOUSEHOLD, meal, prefs, NOW);
    expect(rows.filter((r) => r.type === 'careLog')).toHaveLength(2);
    expect(rows.filter((r) => r.type === 'mealPreset')).toHaveLength(1);
    expect(rows[0]?.data).toMatchObject({
      kind: 'meal',
      foodName: 'Salmon kibble',
      quantity: 300,
      quantityUnit: 'g',
    });
  });

  it('does not save a preset without a quantity or when asked not to', async () => {
    const { rows, service } = setup();
    await service.meal(HOUSEHOLD, { ...meal, quantity: '' }, prefs, NOW);
    await service.meal(HOUSEHOLD, { ...meal, savePreset: false }, prefs, NOW);
    expect(rows.some((r) => r.type === 'mealPreset')).toBe(false);
    expect(rows[0]?.data.quantity).toBeUndefined();
    expect(rows[0]?.data.quantityUnit).toBeUndefined();
  });

  it('refuses a meal with no food or a bad quantity and writes nothing', async () => {
    const { rows, service } = setup();
    await expect(service.meal(HOUSEHOLD, { ...meal, food: ' ' }, prefs, NOW)).rejects.toThrow();
    await expect(service.meal(HOUSEHOLD, { ...meal, quantity: '0' }, prefs, NOW)).rejects.toThrow();
    expect(rows).toHaveLength(0);
  });

  it('lists the newest presets first and logs one from a preset', async () => {
    const { rows, service } = setup();
    await service.meal(HOUSEHOLD, meal, prefs, NOW);
    await service.meal(HOUSEHOLD, { ...meal, food: 'Chicken', quantity: '55' }, prefs, NOW);
    const presets = await service.presets(HOUSEHOLD, PET);
    expect(presets.map((p) => p.data.foodName)).toEqual(['Chicken', 'Salmon kibble']);
    await service.mealFromPreset(HOUSEHOLD, presets[0] as StoredRecord, NOW);
    expect(rows.at(-1)?.data).toMatchObject({ kind: 'meal', foodName: 'Chicken', quantity: 55 });
  });

  it('logs a walk and grooming, with a once reminder when asked', async () => {
    const { rows, service } = setup();
    await service.walk(HOUSEHOLD, PET, 30, NOW);
    await service.grooming(
      HOUSEHOLD,
      {
        petId: PET,
        tasks: ['bath', 'ears'],
        note: ' oatmeal ',
        againDays: 14,
        reminderTitle: 'Bath, Ears',
      },
      prefs,
      NOW,
    );
    expect(rows[0]?.data).toMatchObject({ kind: 'walk', durationMin: 30 });
    expect(rows[1]?.data).toMatchObject({
      kind: 'grooming',
      groomingTasks: ['bath', 'ears'],
      note: 'oatmeal',
    });
    expect(rows[2]).toMatchObject({
      type: 'reminder',
      data: {
        category: 'grooming',
        title: 'Bath, Ears',
        schedule: {
          kind: 'once',
          startOn: '2026-11-23',
          times: ['09:00'],
          notBefore: NOW.toISOString(),
        },
      },
    });
    const none = { petId: PET, tasks: [], note: '', againDays: null, reminderTitle: '' };
    await expect(service.grooming(HOUSEHOLD, none, prefs, NOW)).rejects.toThrow();
  });
});

// QA-29 (service part): the medication check-off.
describe('LogService medication', () => {
  const input = {
    petId: PET,
    name: 'Carprofen 25mg',
    route: 'oral',
    dose: '1 tablet',
    time: '',
    againDays: null,
    reminderTitle: '',
  } as const;

  it('writes the log and the dose together on a match, and Undo deletes both', async () => {
    const { rows, service } = setup();
    seedMedication(rows, 'Carprofen');
    const { records, matched } = await service.medication(HOUSEHOLD, input, ctx, NOW);
    expect(matched?.title).toBe('Carprofen');
    expect(records.map((r) => r.type)).toEqual(['careLog', 'medicationDose']);
    expect(records[0]?.data).toMatchObject({
      kind: 'medication',
      medicationName: 'Carprofen 25mg',
      medicationId: CARPROFEN,
      route: 'oral',
      doseText: '1 tablet',
    });
    expect(records[1]?.data).toMatchObject({
      medicationId: CARPROFEN,
      occurrenceAt: '2026-11-09T08:00:00Z',
      skipped: false,
    });
    await service.undo(records);
    expect(rows.filter((r) => r.type === 'careLog' || r.type === 'medicationDose')).toSatisfy(
      (all: StoredRecord[]) => all.every((r) => r.deletedAt !== null),
    );
  });

  it('writes only the log when nothing matches, or the name is under 3 characters', async () => {
    const { rows, service } = setup();
    seedMedication(rows, 'Rx');
    const none = await service.medication(HOUSEHOLD, { ...input, name: 'Rx 5mg' }, ctx, NOW);
    expect(none.matched).toBeNull();
    expect(none.records.map((r) => r.type)).toEqual(['careLog']);
    const short = await service.medication(HOUSEHOLD, { ...input, name: 'Rx' }, ctx, NOW);
    expect(short.records.map((r) => r.type)).toEqual(['careLog']);
  });

  it('adds a once reminder with the medication category', async () => {
    const { service } = setup();
    const { records } = await service.medication(
      HOUSEHOLD,
      { ...input, name: 'Apoquel', time: '20:00', againDays: 7, reminderTitle: 'Apoquel' },
      ctx,
      NOW,
    );
    expect(records.map((r) => r.type)).toEqual(['careLog', 'reminder']);
    expect(records[1]?.data).toMatchObject({
      category: 'medication',
      schedule: { startOn: '2026-11-16', times: ['20:00'] },
    });
  });
});
