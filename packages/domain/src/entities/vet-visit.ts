import { z } from 'zod';
import { defineEntity } from '../define-entity';
import {
  calendarDate,
  currency,
  fileIds,
  moneyMinor,
  note,
  nullableDate,
  nullableUuid,
  uuid,
} from '../schemas';

export const vetVisitData = z.strictObject({
  petId: uuid,
  visitedOn: calendarDate,
  contactId: nullableUuid.optional(),
  reason: z.string().max(500).nullable().optional(),
  findings: note.optional(),
  diagnosis: z.string().max(1000).nullable().optional(),
  treatment: z.string().max(2000).nullable().optional(),
  costMinor: moneyMinor.nullable().optional(),
  currency: currency.nullable().optional(),
  fileIds: fileIds.optional(),
  followUpOn: nullableDate.optional(),
});

export const vetVisit = defineEntity({
  type: 'vetVisit',
  kind: 'mergeable',
  schema: vetVisitData,
  refs: { petId: 'pet', contactId: 'contact' },
  fileRefs: ['fileIds'],
  parent: 'petId',
  dueSource: { kind: 'date', field: 'followUpOn' },
  indexes: ['petId', 'visitedOn'],
});
