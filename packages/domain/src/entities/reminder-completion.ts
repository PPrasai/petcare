import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { instant, uuid } from '../schemas';

export const reminderCompletionData = z.strictObject({
  reminderId: uuid,
  occurrenceAt: instant,
  completedAt: instant,
});

export const reminderCompletion = defineEntity({
  type: 'reminderCompletion',
  kind: 'appendOnly',
  schema: reminderCompletionData,
  refs: { reminderId: 'reminder' },
  fileRefs: [],
  indexes: ['reminderId', 'occurrenceAt'],
});
