import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { instant, uuid } from '../schemas';

export const EMERGENCY_FIELDS = [
  'photo',
  'name',
  'species',
  'breed',
  'colour',
  'markings',
  'microchipId',
  'allergies',
  'conditions',
  'medications',
  'ownerDisplayName',
  'ownerPhone',
  'notes',
] as const;

export const emergencyCardData = z.strictObject({
  /** Unique per household: one card per pet. */
  petId: uuid,
  visibleFields: z
    .array(z.enum(EMERGENCY_FIELDS))
    .max(12)
    .refine((a) => new Set(a).size === a.length),
  ownerDisplayName: z.string().max(100).nullable().optional(),
  ownerPhone: z.string().max(40).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  isLost: z.boolean(),
  lostSince: instant.nullable().optional(),
  lostMessage: z.string().max(1000).nullable().optional(),
});

export const emergencyCard = defineEntity({
  type: 'emergencyCard',
  kind: 'mergeable',
  schema: emergencyCardData,
  refs: { petId: 'pet' },
  fileRefs: [],
  parent: 'petId',
  indexes: ['petId'],
});
