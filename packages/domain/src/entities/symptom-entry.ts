import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { fileIds, instant, uuid } from '../schemas';

export const symptomEntryData = z.strictObject({
  petId: uuid,
  observedAt: instant,
  description: z.string().min(1).max(5000),
  severity: z.enum(['mild', 'moderate', 'severe']).nullable().optional(),
  fileIds: fileIds.optional(),
});

export const symptomEntry = defineEntity({
  type: 'symptomEntry',
  kind: 'mergeable',
  schema: symptomEntryData,
  refs: { petId: 'pet' },
  fileRefs: ['fileIds'],
  parent: 'petId',
  indexes: ['petId', 'observedAt'],
});
