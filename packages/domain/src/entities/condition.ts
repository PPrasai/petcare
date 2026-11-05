import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { note, nullableDate, shortText, uuid } from '../schemas';

export const conditionData = z.strictObject({
  petId: uuid,
  kind: z.enum(['allergy', 'chronic', 'other']),
  name: shortText,
  severity: z.enum(['mild', 'moderate', 'severe']).nullable().optional(),
  diagnosedOn: nullableDate.optional(),
  resolvedOn: nullableDate.optional(),
  note: note.optional(),
});

export const condition = defineEntity({
  type: 'condition',
  kind: 'mergeable',
  schema: conditionData,
  refs: { petId: 'pet' },
  fileRefs: [],
  parent: 'petId',
  indexes: ['petId', 'kind'],
});
