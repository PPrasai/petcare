import type { z } from 'zod';

/** The data keys of an entity schema: a strict object, or a discriminated union of them. */
export function dataKeys(schema: z.ZodType): string[] {
  const def = schema.def as { type: string; options?: z.ZodType[]; shape?: object };
  if (def.type === 'union' && def.options) return [...new Set(def.options.flatMap(dataKeys))];
  if (def.shape) return Object.keys(def.shape);
  const inner = (schema.def as { innerType?: z.ZodType }).innerType;
  return inner ? dataKeys(inner) : [];
}
