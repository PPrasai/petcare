import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { note, shortText } from '../schemas';

export const contactData = z.strictObject({
  name: shortText,
  role: z.enum([
    'vet',
    'clinic',
    'emergencyClinic',
    'groomer',
    'sitter',
    'trainer',
    'boarding',
    'other',
  ]),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(254).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  website: z
    .string()
    .max(500)
    .regex(/^https?:\/\//)
    .nullable()
    .optional(),
  note: note.optional(),
});

export const contact = defineEntity({
  type: 'contact',
  kind: 'mergeable',
  schema: contactData,
  refs: {},
  fileRefs: [],
  indexes: ['role'],
});
