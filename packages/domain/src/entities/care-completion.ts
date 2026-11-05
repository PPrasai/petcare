import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { instant, note, uuid } from '../schemas';

export const careCompletionData = z.strictObject({
  routineId: uuid,
  petId: uuid,
  occurrenceAt: instant,
  completedAt: instant,
  skipped: z.boolean(),
  note: note.optional(),
});

export const careCompletion = defineEntity({
  type: 'careCompletion',
  kind: 'appendOnly',
  schema: careCompletionData,
  refs: { routineId: 'careRoutine', petId: 'pet' },
  fileRefs: [],
  parent: 'petId',
  indexes: ['petId', 'routineId', 'occurrenceAt'],
});
