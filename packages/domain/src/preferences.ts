import { z } from 'zod';

/** Per-user display and notification preferences (CON-petcare-001 `Preferences`). */
const lead = (max: number) => z.number().int().min(0).max(max);

export const PUSH_TYPES = [
  'vaccination',
  'medication',
  'careRoutine',
  'reminder',
  'vetVisit',
] as const;

export const preferencesSchema = z.strictObject({
  weightUnit: z.enum(['kg', 'lb']),
  lengthUnit: z.enum(['cm', 'in']),
  temperatureUnit: z.enum(['c', 'f']),
  timeZone: z.string().min(1).max(64),
  dateFormat: z.enum(['iso', 'dmy', 'mdy']),
  currency: z.string().regex(/^[A-Z]{3}$/),
  theme: z.enum(['system', 'light', 'dark']),
  leadMinutes: z.strictObject({
    vaccination: lead(43200),
    medication: lead(1440),
    careRoutine: lead(1440),
    reminder: lead(43200),
    vetVisit: lead(43200),
  }),
  pushEnabled: z.boolean(),
  pushTypes: z
    .array(z.enum(PUSH_TYPES))
    .refine((a) => new Set(a).size === a.length, 'must be unique'),
});
export type Preferences = z.infer<typeof preferencesSchema>;

/** What a new user gets (matches the DDL defaults in CON-petcare-002). */
export const DEFAULT_PREFERENCES: Preferences = {
  weightUnit: 'kg',
  lengthUnit: 'cm',
  temperatureUnit: 'c',
  timeZone: 'UTC',
  dateFormat: 'iso',
  currency: 'USD',
  theme: 'system',
  leadMinutes: { vaccination: 10080, medication: 0, careRoutine: 0, reminder: 0, vetVisit: 1440 },
  pushEnabled: true,
  pushTypes: [...PUSH_TYPES],
};

/** True when `tz` is an IANA zone this runtime knows. */
export function isKnownTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
