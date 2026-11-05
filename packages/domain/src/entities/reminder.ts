import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { note, nullableUuid, scheduleSchema, shortText } from '../schemas';

export const reminderData = z.strictObject({
  petId: nullableUuid.optional(),
  title: shortText,
  schedule: scheduleSchema,
  active: z.boolean(),
  note: note.optional(),
});

export const reminder = defineEntity({
  type: 'reminder',
  kind: 'mergeable',
  schema: reminderData,
  refs: { petId: 'pet' },
  fileRefs: [],
  dueSource: { kind: 'schedule' },
  indexes: ['petId', 'active'],
});
