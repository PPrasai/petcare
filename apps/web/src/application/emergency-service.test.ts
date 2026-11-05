import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_VISIBLE, EmergencyService } from './emergency-service';
import type { EmergencyApi } from './ports/emergency-api';
import type { RecordStore, StoredRecord } from './ports/record-store';

const PET = '0190e5a0-0000-7000-8000-000000000001';

const card = (data: Record<string, unknown>): StoredRecord => ({
  id: 'card-1',
  type: 'emergencyCard',
  householdId: 'h1',
  version: 1,
  createdBy: 'u1',
  updatedAt: '2026-06-01T00:00:00Z',
  deletedAt: null,
  pending: false,
  data: { petId: PET, visibleFields: ['name'], isLost: false, ...data },
});

function setup(existing: StoredRecord[] = []) {
  const create = vi.fn(async (_t, _h, data) => card(data));
  const update = vi.fn(async (_t, _id, fields) => card(fields));
  const records = { list: async () => existing, create, update } as unknown as RecordStore;
  const service = new EmergencyService(
    records,
    {} as EmergencyApi,
    () => new Date('2026-06-02T10:00:00Z'),
  );
  return { service, create, update };
}

const form = {
  visibleFields: ['notes', 'name'] as ('notes' | 'name')[],
  ownerDisplayName: ' Sam ',
  ownerPhone: '',
  notes: 'shy',
};

describe('EmergencyService', () => {
  it('creates the card on first save, in the schema field order, with empty text left out', async () => {
    const { service, create } = setup();
    await service.save('h1', PET, form);
    expect(create).toHaveBeenCalledWith('emergencyCard', 'h1', {
      petId: PET,
      isLost: false,
      visibleFields: ['name', 'notes'],
      ownerDisplayName: 'Sam',
      notes: 'shy',
    });
  });

  it('updates the existing card and clears emptied text', async () => {
    const { service, update } = setup([card({ ownerPhone: '555' })]);
    await service.save('h1', PET, form);
    expect(update).toHaveBeenCalledWith('emergencyCard', 'card-1', {
      visibleFields: ['name', 'notes'],
      ownerDisplayName: 'Sam',
      ownerPhone: null,
      notes: 'shy',
    });
  });

  it('marks lost with the time and message, creating a minimal card if there is none', async () => {
    const { service, create } = setup();
    await service.markLost('h1', PET, ' Please call ');
    expect(create).toHaveBeenCalledWith('emergencyCard', 'h1', {
      petId: PET,
      visibleFields: DEFAULT_VISIBLE,
      isLost: true,
      lostSince: '2026-06-02T10:00:00.000Z',
      lostMessage: 'Please call',
    });
  });

  it('marks found by clearing the lost fields', async () => {
    const { service, update } = setup([card({ isLost: true })]);
    await service.markFound('h1', PET);
    expect(update).toHaveBeenCalledWith('emergencyCard', 'card-1', {
      isLost: false,
      lostSince: null,
      lostMessage: null,
    });
  });

  it('ignores a deleted card and a card of another pet', async () => {
    const { service } = setup([
      { ...card({}), deletedAt: '2026-06-01T00:00:00Z' },
      card({ petId: '0190e5a0-0000-7000-8000-000000000002' }),
    ]);
    expect(await service.get('h1', PET)).toBeNull();
  });
});
