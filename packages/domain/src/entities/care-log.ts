import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { instant, note, quantity, quantityUnit, shortText, uuid } from '../schemas';

const base = {
  petId: uuid,
  occurredAt: instant,
  note: note.optional(),
};

/** Per-kind fields (CON-003 2.2). Strict objects, so a field of another kind is rejected. */
export const careLogData = z.discriminatedUnion('kind', [
  z
    .strictObject({
      ...base,
      kind: z.literal('meal'),
      foodName: shortText,
      quantity: quantity.optional(),
      quantityUnit: quantityUnit.optional(),
    })
    .refine((d) => (d.quantity === undefined) === (d.quantityUnit === undefined), {
      message: 'quantity and quantityUnit go together',
    }),
  z.strictObject({
    ...base,
    kind: z.literal('walk'),
    durationMin: z.number().int().min(1).max(1440),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('grooming'),
    groomingTasks: z
      .array(z.enum(['bath', 'brushing', 'nailTrim', 'haircut', 'teeth', 'ears', 'other']))
      .min(1)
      .max(7)
      .refine((a) => new Set(a).size === a.length),
  }),
  z.strictObject({
    ...base,
    kind: z.literal('medication'),
    medicationName: shortText,
    medicationId: uuid.optional(),
    route: z.enum(['oral', 'topical']).optional(),
    doseText: z.string().min(1).max(100).optional(),
  }),
]);

export const careLog = defineEntity({
  type: 'careLog',
  kind: 'appendOnly',
  schema: careLogData,
  refs: { petId: 'pet', medicationId: 'medication' },
  fileRefs: [],
  parent: 'petId',
  indexes: ['petId', 'kind', 'occurredAt'],
});
