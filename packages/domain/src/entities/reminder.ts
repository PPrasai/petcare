import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { note, nullableUuid, scheduleSchema, shortText } from '../schemas';

export const reminderData = z.strictObject({
  petId: nullableUuid.optional(),
  title: shortText,
  schedule: scheduleSchema,
  active: z.boolean(),
  note: note.optional(),
  /** What the reminder is about (CON-003). Nothing writes it before slice P6. */
  category: z
    .enum(['walk', 'medication', 'grooming', 'vetVisit', 'weighIn', 'other'])
    .nullable()
    .optional(),
  /** null = everyone; otherwise the only user notified (CON-003 2.3, 2.6). */
  audienceUserId: z.string().min(1).max(64).nullable().optional(),
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
