import { z } from 'zod';
import { defineEntity } from '../define-entity';
import { quantity, quantityUnit, shortText, uuid } from '../schemas';

export const mealPresetData = z.strictObject({
  petId: uuid,
  foodName: shortText,
  quantity,
  quantityUnit,
});

export const mealPreset = defineEntity({
  type: 'mealPreset',
  kind: 'mergeable',
  schema: mealPresetData,
  refs: { petId: 'pet' },
  fileRefs: [],
  parent: 'petId',
  indexes: ['petId'],
});
