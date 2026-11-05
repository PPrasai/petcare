import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { note, nullableUuid, scheduleSchema, shortText, uuid } from '../schemas';

export const medicationData = z.strictObject({
  petId: uuid,
  name: shortText,
  dose: z.number().gt(0).nullable().optional(),
  doseUnit: z
    .enum(['mg', 'ml', 'tablet', 'capsule', 'drop', 'puff', 'application', 'other'])
    .nullable()
    .optional(),
  /** The course start and end are schedule.startOn and schedule.endOn. */
  schedule: scheduleSchema,
  prescribedByContactId: nullableUuid.optional(),
  note: note.optional(),
});

export const medication = defineEntity({
  type: 'medication',
  kind: 'mergeable',
  schema: medicationData,
  refs: { petId: 'pet', prescribedByContactId: 'contact' },
  fileRefs: [],
  parent: 'petId',
  dueSource: { kind: 'schedule' },
  indexes: ['petId'],
});
