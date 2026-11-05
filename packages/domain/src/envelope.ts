import { z } from 'zod';
import { entities } from './registry';
import { instant, uuid } from './schemas';
import type { RecordType } from './schemas';

/** Fields every record carries (CON-petcare-002 envelope). */
export const envelopeFields = {
  id: uuid,
  householdId: uuid,
  version: z.number().int().min(1),
  createdAt: instant,
  createdBy: z.string().min(1).max(64),
  updatedAt: instant,
  updatedBy: z.string().min(1).max(64),
  deletedAt: instant.nullable(),
};

export interface RecordEnvelope {
  id: string;
  type: RecordType;
  householdId: string;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deletedAt: string | null;
  data: Record<string, unknown>;
}

const variants = entities.map((e) =>
  z.looseObject({ ...envelopeFields, type: z.literal(e.type), data: e.schema }),
);

/** Accepts exactly the records that records.schema.json `Record` accepts (I-10). */
export const recordSchema = z.union(variants as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]]);

export function isValidRecord(value: unknown): boolean {
  return recordSchema.safeParse(value).success;
}
