import { describe, expect, it } from 'vitest';
import { emptyPetForm } from './pet-form';
import { PetService } from './pet-service';
import type { NewRecord, RecordStore, StoredRecord } from './ports/record-store';

const PET = '0190a1b2-c3d4-7e5f-8a6b-7c8d9e0f1a2c';
const reminder = (petId: string) => ({
  petId,
  title: 'Walk',
  active: true,
  category: 'walk',
  schedule: { tz: 'UTC', kind: 'daily', times: ['08:00'], startOn: '2026-11-10' },
});

function setup(fail = false) {
  const calls: NewRecord[][] = [];
  const records = {
    createMany: (householdId: string, items: NewRecord[]) => {
      calls.push(items);
      if (fail) return Promise.reject(new Error('disk full'));
      return Promise.resolve(
        items.map((i, n): StoredRecord => ({
          id: i.id ?? `r${n}`,
          type: i.type,
          householdId,
          version: 0,
          createdBy: 'me',
          updatedAt: '',
          deletedAt: null,
          pending: true,
          data: i.data,
        })),
      );
    },
    create: () => Promise.reject(new Error('the wizard must not create records one by one')),
  } as unknown as RecordStore;
  return { calls, service: new PetService(records, { next: () => PET }) };
}

describe('PetService.createWithReminders', () => {
  it('writes the pet and its reminders in one createMany, reminders pointing at the pet', async () => {
    const { calls, service } = setup();
    const pet = await service.createWithReminders('h1', { ...emptyPetForm, name: 'Momo' }, (id) => [
      reminder(id),
    ]);
    expect(pet.id).toBe(PET);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.map((i) => i.type)).toEqual(['pet', 'reminder']);
    expect(calls[0]?.[0]?.id).toBe(PET);
    expect(calls[0]?.[1]?.data.petId).toBe(PET);
  });

  it('writes nothing when a reminder is invalid or the write fails', async () => {
    const bad = setup();
    await expect(
      bad.service.createWithReminders('h1', { ...emptyPetForm, name: 'Momo' }, () => [
        { title: 'no schedule' },
      ]),
    ).rejects.toThrow();
    expect(bad.calls).toHaveLength(0);
    const down = setup(true);
    await expect(
      down.service.createWithReminders('h1', { ...emptyPetForm, name: 'Momo' }, () => []),
    ).rejects.toThrow('disk full');
  });

  it('refuses a pet without a name before writing', async () => {
    const { calls, service } = setup();
    await expect(service.createWithReminders('h1', emptyPetForm, () => [])).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });
});
