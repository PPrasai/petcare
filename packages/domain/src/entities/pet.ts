import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { instant, nullableDate, nullableUuid, shortText } from '../schemas';

const text = (max: number) => z.string().max(max).nullable().optional();

export const petData = z.strictObject({
  name: shortText,
  species: z.enum([
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
  ]),
  speciesOther: text(100),
  breed: text(100),
  isMixedBreed: z.boolean().optional(),
  sex: z.enum(['male', 'female', 'unknown']).optional(),
  neutered: z.boolean().nullable().optional(),
  birthDate: nullableDate.optional(),
  birthDateEstimated: z.boolean().optional(),
  colour: text(100),
  markings: text(500),
  microchipId: text(32),
  photoFileId: nullableUuid.optional(),
  adoptedOn: nullableDate.optional(),
  insurance: z
    .strictObject({
      provider: z.string().max(100).optional(),
      policyNumber: z.string().max(100).optional(),
      renewsOn: nullableDate.optional(),
    })
    .nullable()
    .optional(),
  diet: text(1000),
  bloodType: text(20),
  sizeCategory: z.enum(['toy', 'small', 'medium', 'large', 'giant']).nullable().optional(),
  archivedAt: instant.nullable().optional(),
  archivedReason: z.enum(['deceased', 'rehomed', 'lost', 'other']).nullable().optional(),
});

export const pet = defineEntity({
  type: 'pet',
  kind: 'mergeable',
  schema: petData,
  refs: {},
  fileRefs: ['photoFileId'],
  indexes: ['archivedAt'],
});
