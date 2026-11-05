import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { instant, note, uuid } from '../schemas';

export const medicationDoseData = z.strictObject({
  medicationId: uuid,
  petId: uuid,
  /** The scheduled occurrence this dose answers. */
  occurrenceAt: instant,
  givenAt: instant,
  skipped: z.boolean(),
  note: note.optional(),
});

export const medicationDose = defineEntity({
  type: 'medicationDose',
  kind: 'appendOnly',
  schema: medicationDoseData,
  refs: { medicationId: 'medication', petId: 'pet' },
  fileRefs: [],
  parent: 'petId',
  indexes: ['petId', 'medicationId', 'occurrenceAt'],
});
