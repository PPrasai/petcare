import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { note, scheduleSchema, shortText, uuid } from '../schemas';

export const careRoutineData = z.strictObject({
  petId: uuid,
  kind: z.enum(['feeding', 'walk', 'grooming', 'fleaTick', 'deworming', 'custom']),
  title: shortText,
  schedule: scheduleSchema,
  active: z.boolean(),
  note: note.optional(),
});

export const careRoutine = defineEntity({
  type: 'careRoutine',
  kind: 'mergeable',
  schema: careRoutineData,
  refs: { petId: 'pet' },
  fileRefs: [],
  parent: 'petId',
  dueSource: { kind: 'schedule' },
  indexes: ['petId', 'active'],
});
