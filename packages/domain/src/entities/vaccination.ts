import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { calendarDate, note, nullableDate, nullableUuid, shortText, uuid } from '../schemas';

export const vaccinationData = z.strictObject({
  petId: uuid,
  vaccineName: shortText,
  givenOn: calendarDate,
  batchNumber: z.string().max(100).nullable().optional(),
  contactId: nullableUuid.optional(),
  nextDueOn: nullableDate.optional(),
  certificateFileId: nullableUuid.optional(),
  note: note.optional(),
});

export const vaccination = defineEntity({
  type: 'vaccination',
  kind: 'mergeable',
  schema: vaccinationData,
  refs: { petId: 'pet', contactId: 'contact' },
  fileRefs: ['certificateFileId'],
  parent: 'petId',
  dueSource: { kind: 'date', field: 'nextDueOn' },
  indexes: ['petId', 'nextDueOn'],
});
