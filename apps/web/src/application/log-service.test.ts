import { describe, expect, it } from 'vitest';
import { DocumentService } from './document-service';
import { ExpenseService } from './expense-service';
import { HealthService } from './health-service';
import { LogService } from './log-service';
import { MeasurementService } from './measurement-service';
import type { FileGateway } from './ports/file-gateway';
import { PhotoUnusable } from './ports/image-reducer';
import type { ImageReducer } from './ports/image-reducer';
import type { RecordStore, StoredRecord } from './ports/record-store';

const PET = '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2b';
const HOUSEHOLD = 'h1';
const NOW = new Date('2026-11-09T14:30:00Z');
const prefs = {
  weightUnit: 'kg',
  lengthUnit: 'cm',
  temperatureUnit: 'c',
  timeZone: 'UTC',
  currency: 'USD',
} as const;

const shrink: ImageReducer = {
  reduce: () => Promise.resolve(new Blob(['small'], { type: 'image/jpeg' })),
};

function memoryStore() {
  const rows: StoredRecord[] = [];
  const store: RecordStore = {
    list: (type) => Promise.resolve(rows.filter((r) => r.type === type)),
    get: (type, id) => Promise.resolve(rows.find((r) => r.type === type && r.id === id)),
    create: (type, householdId, data) => {
      const row: StoredRecord = {
        id: `id-${rows.length}`,
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
    createMany: () => Promise.reject(new Error('unused')),
    update: () => Promise.reject(new Error('unused')),
    remove: () => Promise.reject(new Error('unused')),
  };
  return { rows, store };
}

function setup(reducer: ImageReducer = shrink) {
  const { rows, store } = memoryStore();
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
    reducer,
  );
  return { rows, service };
}

// QA-27 (existing kinds): each kind writes the record type the architecture maps it to.
describe('LogService', () => {
  it('stores a weight in kilograms whatever unit it was shown in', async () => {
    const { rows, service } = setup();
    await service.weight(HOUSEHOLD, PET, 12.5, prefs, NOW);
    await service.weight(HOUSEHOLD, PET, 20, { ...prefs, weightUnit: 'lb' }, NOW);
    expect(rows.map((r) => [r.type, r.data.kind])).toEqual([
      ['measurement', 'weight'],
      ['measurement', 'weight'],
    ]);
    expect(rows[0]?.data.value).toBe(12.5);
    expect(Number(rows[1]?.data.value)).toBeCloseTo(9.07, 1);
  });

  it('writes a note as a symptom entry and refuses an empty one', async () => {
    const { rows, service } = setup();
    await service.note(HOUSEHOLD, PET, '  Limping  ', NOW);
    expect(rows[0]).toMatchObject({ type: 'symptomEntry', data: { description: 'Limping' } });
    await expect(service.note(HOUSEHOLD, PET, '   ', NOW)).rejects.toThrow();
    expect(rows).toHaveLength(1);
  });

  it('writes an expense in minor units with the local date', async () => {
    const { rows, service } = setup();
    await service.expense(HOUSEHOLD, PET, '12.50', 'food', prefs, NOW);
    expect(rows[0]).toMatchObject({
      type: 'expense',
      data: { category: 'food', amountMinor: 1250, currency: 'USD', spentOn: '2026-11-09' },
    });
    await expect(service.expense(HOUSEHOLD, PET, '', 'food', prefs, NOW)).rejects.toThrow();
  });

  it('writes a vet visit with an optional cost', async () => {
    const { rows, service } = setup();
    await service.vetVisit(HOUSEHOLD, PET, 'Annual check-up', '', prefs, NOW);
    await service.vetVisit(HOUSEHOLD, PET, 'Recheck', '96', prefs, NOW);
    expect(rows[0]?.data).toMatchObject({ reason: 'Annual check-up', visitedOn: '2026-11-09' });
    expect(rows[0]?.data.costMinor).toBeUndefined();
    expect(rows[1]?.data).toMatchObject({ costMinor: 9600, currency: 'USD' });
    await expect(service.vetVisit(HOUSEHOLD, PET, ' ', '', prefs, NOW)).rejects.toThrow();
  });

  it('files a photo as a document in the photo category', async () => {
    const { rows, service } = setup();
    await service.photo(HOUSEHOLD, PET, new File(['x'], 'beach.jpg', { type: 'image/jpeg' }));
    expect(rows[0]).toMatchObject({
      type: 'document',
      data: { petId: PET, title: 'beach.jpg', category: 'photo' },
    });
  });

  it('keeps the reduced picture, not the original, and writes nothing for an unusable file', async () => {
    const kept: File[] = [];
    const { rows, store } = memoryStore();
    const files: FileGateway = {
      attach: (_h, file) => {
        kept.push(file);
        return Promise.resolve({ fileId: '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c' });
      },
      open: () => Promise.resolve(null),
      release: () => undefined,
      discard: () => Promise.resolve(),
    };
    const build = (reducer: ImageReducer) =>
      new LogService(
        new MeasurementService(store),
        new HealthService(store),
        new ExpenseService(store),
        new DocumentService(store),
        files,
        reducer,
      );
    await build(shrink).photo(HOUSEHOLD, PET, new File(['original-bytes'], 'a.png'));
    expect(kept[0]?.size).toBe(5);
    expect(kept[0]?.type).toBe('image/jpeg');
    const broken: ImageReducer = { reduce: () => Promise.reject(new PhotoUnusable()) };
    await expect(build(broken).photo(HOUSEHOLD, PET, new File(['x'], 'b.png'))).rejects.toThrow(
      PhotoUnusable,
    );
    expect(kept).toHaveLength(1);
    expect(rows).toHaveLength(1);
  });

  it('writes none of the shapes that only contract 003 allows', async () => {
    const { rows, service } = setup();
    await service.weight(HOUSEHOLD, PET, 5, prefs, NOW);
    await service.note(HOUSEHOLD, PET, 'x', NOW);
    await service.expense(HOUSEHOLD, PET, '1', 'vet', prefs, NOW);
    await service.vetVisit(HOUSEHOLD, PET, 'x', '', prefs, NOW);
    const forbidden = ['careLog', 'mealPreset'];
    expect(rows.some((r) => forbidden.includes(r.type))).toBe(false);
  });
});
