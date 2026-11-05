import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { instant, note, uuid } from '../schemas';

export const measurementData = z.strictObject({
  petId: uuid,
  kind: z.enum([
    'weight',
    'height',
    'length',
    'temperature',
    'heartRate',
    'respiratoryRate',
    'bodyCondition',
  ]),
  /** SI: kg, cm, cm, degrees C, beats/min, breaths/min, 1-9 scale. */
  value: z.number().gt(0).max(100_000),
  measuredAt: instant,
  note: note.optional(),
});

export const measurement = defineEntity({
  type: 'measurement',
  kind: 'mergeable',
  schema: measurementData,
  refs: { petId: 'pet' },
  fileRefs: [],
  parent: 'petId',
  indexes: ['petId', 'kind', 'measuredAt'],
});
