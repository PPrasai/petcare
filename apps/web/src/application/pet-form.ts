import type { StoredRecord } from './ports/record-store';

export const SPECIES = [
  'dog',
  'cat',
  'bird',
  'rabbit',
  'guineaPig',
  'hamster',
  'fish',
  'reptile',
  'horse',
  'other',
] as const;
export type Species = (typeof SPECIES)[number];

export const SIZES = ['toy', 'small', 'medium', 'large', 'giant'] as const;
export const SEXES = ['male', 'female', 'unknown'] as const;
export const ARCHIVE_REASONS = ['deceased', 'rehomed', 'lost', 'other'] as const;
export type ArchiveReason = (typeof ARCHIVE_REASONS)[number];

/** Everything on the pet form, as the strings and booleans the inputs hold. */
export interface PetFormValues {
  name: string;
  species: Species;
  speciesOther: string;
  breed: string;
  isMixedBreed: boolean;
  sex: '' | (typeof SEXES)[number];
  neutered: '' | 'yes' | 'no';
  birthDate: string;
  birthDateEstimated: boolean;
  colour: string;
  markings: string;
  microchipId: string;
  adoptedOn: string;
  insuranceProvider: string;
  insurancePolicy: string;
  insuranceRenewsOn: string;
  diet: string;
  bloodType: string;
  sizeCategory: '' | (typeof SIZES)[number];
}

export const emptyPetForm: PetFormValues = {
  name: '',
  species: 'dog',
  speciesOther: '',
  breed: '',
  isMixedBreed: false,
  sex: '',
  neutered: '',
  birthDate: '',
  birthDateEstimated: false,
  colour: '',
  markings: '',
  microchipId: '',
  adoptedOn: '',
  insuranceProvider: '',
  insurancePolicy: '',
  insuranceRenewsOn: '',
  diet: '',
  bloodType: '',
  sizeCategory: '',
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** A stored pet as form values. */
export function petToForm(pet: StoredRecord): PetFormValues {
  const d = pet.data;
  const insurance = (d.insurance ?? {}) as Record<string, unknown>;
  return {
    name: str(d.name),
    species: (SPECIES as readonly string[]).includes(str(d.species))
      ? (d.species as Species)
      : 'other',
    speciesOther: str(d.speciesOther),
    breed: str(d.breed),
    isMixedBreed: d.isMixedBreed === true,
    sex: SEXES.includes(d.sex as never) ? (d.sex as PetFormValues['sex']) : '',
    neutered: d.neutered === true ? 'yes' : d.neutered === false ? 'no' : '',
    birthDate: str(d.birthDate),
    birthDateEstimated: d.birthDateEstimated === true,
    colour: str(d.colour),
    markings: str(d.markings),
    microchipId: str(d.microchipId),
    adoptedOn: str(d.adoptedOn),
    insuranceProvider: str(insurance.provider),
    insurancePolicy: str(insurance.policyNumber),
    insuranceRenewsOn: str(insurance.renewsOn),
    diet: str(d.diet),
    bloodType: str(d.bloodType),
    sizeCategory: SIZES.includes(d.sizeCategory as never)
      ? (d.sizeCategory as PetFormValues['sizeCategory'])
      : '',
  };
}

const blank = (s: string): string | null => (s.trim() === '' ? null : s.trim());

/** Form values as pet data. Empty inputs become null, meaning "no value". */
export function formToPetData(v: PetFormValues): Record<string, unknown> {
  const insurance = {
    ...(blank(v.insuranceProvider) ? { provider: v.insuranceProvider.trim() } : {}),
    ...(blank(v.insurancePolicy) ? { policyNumber: v.insurancePolicy.trim() } : {}),
    ...(blank(v.insuranceRenewsOn) ? { renewsOn: v.insuranceRenewsOn } : {}),
  };
  return {
    name: v.name.trim(),
    species: v.species,
    speciesOther: v.species === 'other' ? blank(v.speciesOther) : null,
    breed: blank(v.breed),
    isMixedBreed: v.isMixedBreed,
    sex: v.sex === '' ? null : v.sex,
    neutered: v.neutered === '' ? null : v.neutered === 'yes',
    birthDate: blank(v.birthDate),
    birthDateEstimated: v.birthDateEstimated,
    colour: blank(v.colour),
    markings: blank(v.markings),
    microchipId: blank(v.microchipId),
    adoptedOn: blank(v.adoptedOn),
    insurance: Object.keys(insurance).length > 0 ? insurance : null,
    diet: blank(v.diet),
    bloodType: blank(v.bloodType),
    sizeCategory: v.sizeCategory === '' ? null : v.sizeCategory,
  };
}

/** For a new pet: only the values that are set. */
export function withoutEmpty(data: Record<string, unknown>): Record<string, unknown> {
  const flags = ['isMixedBreed', 'birthDateEstimated'];
  return Object.fromEntries(
    Object.entries(data).filter(
      ([key, v]) => v !== null && v !== undefined && !(v === false && flags.includes(key)),
    ),
  );
}

/**
 * For an edit: only the fields that differ from the stored pet. Sending fewer fields keeps
 * concurrent edits by other members from being reported as conflicts.
 */
export function changedFields(
  stored: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const flags = ['isMixedBreed', 'birthDateEstimated'];
  const falseIsAbsent = (key: string, value: unknown) =>
    value === false && flags.includes(key) && stored[key] === undefined ? undefined : value;
  return Object.fromEntries(
    Object.entries(next).filter(([key, value]) => !same(stored[key], falseIsAbsent(key, value))),
  );
}
