/** Small helpers for the per-field merge rule (CON-petcare-002 2.3 step 4). */

export type Data = Record<string, unknown>;

export function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Current data with the update's fields applied on top. */
export function applyFields(current: Data, fields: Data): Data {
  return { ...current, ...fields };
}

/** The keys in `fields` whose value actually differs from `current`. */
export function changedKeys(current: Data, fields: Data): string[] {
  return Object.keys(fields).filter((k) => !sameValue(current[k], fields[k]));
}
