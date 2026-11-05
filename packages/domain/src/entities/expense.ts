import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { calendarDate, currency, moneyMinor, note, nullableUuid } from '../schemas';

export const expenseData = z.strictObject({
  petId: nullableUuid.optional(),
  spentOn: calendarDate,
  category: z.enum([
    'vet',
    'food',
    'grooming',
    'insurance',
    'supplies',
    'medication',
    'boarding',
    'training',
    'other',
  ]),
  amountMinor: moneyMinor,
  currency,
  note: note.optional(),
  fileId: nullableUuid.optional(),
});

export const expense = defineEntity({
  type: 'expense',
  kind: 'mergeable',
  schema: expenseData,
  refs: { petId: 'pet' },
  fileRefs: ['fileId'],
  indexes: ['petId', 'spentOn', 'currency'],
});
