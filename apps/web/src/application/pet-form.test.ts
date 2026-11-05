import { describe, expect, it } from 'vitest';
import { changedFields, emptyPetForm, formToPetData, petToForm, withoutEmpty } from './pet-form';
import type { StoredRecord } from './ports/record-store';

const stored = (data: Record<string, unknown>): StoredRecord => ({
  id: 'x',
  type: 'pet',
  householdId: 'h',
  version: 1,
  createdBy: 'u',
  updatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
  pending: false,
  data,
});

describe('pet form mapping', () => {
  it('a new pet carries only the values that are set', () => {
    const data = withoutEmpty(formToPetData({ ...emptyPetForm, name: ' Momo ', breed: 'Terrier' }));
    expect(data).toEqual({ name: 'Momo', species: 'dog', breed: 'Terrier' });
  });

  it('keeps an explicit "no" for neutered and builds insurance only when given', () => {
    const data = withoutEmpty(
      formToPetData({ ...emptyPetForm, name: 'A', neutered: 'no', insuranceProvider: 'PetSure' }),
    );
    expect(data.neutered).toBe(false);
    expect(data.insurance).toEqual({ provider: 'PetSure' });
  });

  it('round-trips a stored pet through the form', () => {
    const pet = stored({ name: 'Momo', species: 'cat', neutered: true, birthDate: '2020-01-02' });
    const form = petToForm(pet);
    expect(form).toMatchObject({
      name: 'Momo',
      species: 'cat',
      neutered: 'yes',
      birthDate: '2020-01-02',
    });
    expect(changedFields(pet.data, formToPetData(form))).toEqual({});
  });
});

describe('changedFields', () => {
  it('lists only changed fields and uses null to clear a value', () => {
    const pet = stored({ name: 'Momo', species: 'dog', breed: 'Terrier', colour: 'Black' });
    const next = formToPetData({ ...petToForm(pet), colour: '', breed: 'Beagle' });
    expect(changedFields(pet.data, next)).toEqual({ breed: 'Beagle', colour: null });
  });

  it('does not report an unset flag as a change', () => {
    const pet = stored({ name: 'Momo', species: 'dog' });
    expect(changedFields(pet.data, formToPetData(petToForm(pet)))).toEqual({});
  });
});
