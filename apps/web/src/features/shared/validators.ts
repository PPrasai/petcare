import type { ZodType } from 'zod';

/** Adapts a Zod schema to a TanStack Form field validator that returns the first message. */
export function zodField(schema: ZodType): ({ value }: { value: unknown }) => string | undefined {
  return ({ value }) => {
    const result = schema.safeParse(value);
    return result.success ? undefined : (result.error.issues[0]?.message ?? 'Invalid');
  };
}
