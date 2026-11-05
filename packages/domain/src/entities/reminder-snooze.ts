import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { instant, uuid } from '../schemas';

export const reminderSnoozeData = z.strictObject({
  sourceType: z.enum(['vaccination', 'medication', 'careRoutine', 'reminder', 'vetVisit']),
  sourceId: uuid,
  occurrenceAt: instant,
  snoozedUntil: instant,
  /** Snoozes are per user; must equal the pushing user. */
  userId: z.string().min(1).max(64),
});

export const reminderSnooze = defineEntity({
  type: 'reminderSnooze',
  kind: 'appendOnly',
  schema: reminderSnoozeData,
  // sourceId references a record whose type is sourceType; the sync service checks that pair.
  refs: {},
  fileRefs: [],
  indexes: ['sourceId', 'occurrenceAt', 'userId'],
});
