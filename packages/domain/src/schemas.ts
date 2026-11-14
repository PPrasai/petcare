import { z } from 'zod';

/** Shared field schemas. They mirror $defs in packages/contracts/records.schema.json. */
export const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const instant = z
  .string()
  .regex(/Z$/)
  .refine(
    (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(s) && !Number.isNaN(Date.parse(s)),
  );
export const currency = z.string().regex(/^[A-Z]{3}$/);
export const moneyMinor = z.number().int().min(0).max(100_000_000_000);
export const shortText = z.string().min(1).max(200);
export const note = z.string().max(5000);
export const nullableUuid = uuid.nullable();
export const nullableDate = calendarDate.nullable();
export const fileIds = z
  .array(uuid)
  .max(20)
  .refine((a) => new Set(a).size === a.length);

const isoWeekday = z.number().int().min(1).max(7);
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const scheduleSchema = z
  .strictObject({
    tz: z.string().min(1).max(64),
    kind: z.enum(['once', 'daily', 'weekly', 'monthly', 'everyNDays', 'yearly']),
    times: z
      .array(timeOfDay)
      .max(12)
      .refine((a) => new Set(a).size === a.length)
      .optional(),
    daysOfWeek: z
      .array(isoWeekday)
      .refine((a) => new Set(a).size === a.length)
      .optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    everyN: z.number().int().min(1).max(3650).optional(),
    startOn: calendarDate,
    endOn: nullableDate.optional(),
    /** No occurrence earlier than this instant is generated (CON-003 2.6). */
    notBefore: instant.optional(),
  })
  .superRefine((s, ctx) => {
    const need = (ok: boolean, path: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message: `required for ${s.kind}` });
    };
    if (s.kind === 'weekly') need((s.daysOfWeek?.length ?? 0) >= 1, 'daysOfWeek');
    if (s.kind === 'monthly') need(s.dayOfMonth !== undefined, 'dayOfMonth');
    if (s.kind === 'everyNDays') need(s.everyN !== undefined, 'everyN');
  });
export type Schedule = z.infer<typeof scheduleSchema>;

export const RECORD_TYPES = [
  'pet',
  'measurement',
  'vaccination',
  'medication',
  'medicationDose',
  'vetVisit',
  'condition',
  'symptomEntry',
  'careRoutine',
  'careCompletion',
  'reminder',
  'reminderCompletion',
  'reminderSnooze',
  'document',
  'expense',
  'contact',
  'emergencyCard',
  'careLog',
  'mealPreset',
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** Stored in the unit the user chose (CON-003 1: kitchen units have no fixed mass). */
export const QUANTITY_UNITS = ['g', 'kg', 'oz', 'lb', 'cup', 'can', 'pouch', 'tbsp'] as const;
export const quantity = z.number().gt(0).max(100_000);
export const quantityUnit = z.enum(QUANTITY_UNITS);
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];
