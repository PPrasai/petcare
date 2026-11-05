import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { nullableUuid, RECORD_TYPES, shortText, uuid } from '../schemas';

export const documentData = z.strictObject({
  petId: nullableUuid.optional(),
  title: shortText,
  category: z.enum([
    'vetRecord',
    'certificate',
    'receipt',
    'insurance',
    'photo',
    'labResult',
    'other',
  ]),
  fileId: uuid,
  linkedRecordType: z.enum(RECORD_TYPES).nullable().optional(),
  linkedRecordId: nullableUuid.optional(),
});

export const document = defineEntity({
  type: 'document',
  kind: 'mergeable',
  schema: documentData,
  refs: { petId: 'pet' },
  fileRefs: ['fileId'],
  indexes: ['petId', 'category'],
});
