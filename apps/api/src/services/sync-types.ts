import { MAX_MUTATIONS_PER_PUSH, isRecordType } from '@petcare/domain';
import type { RecordEnvelope, RecordType } from '@petcare/domain';
import { z } from 'zod';
import { columnsOf, iso, toColumnValue } from '../repositories';
import type { ChangeLogEntry, ConflictRow, Repositories, UnitOfWork } from '../repositories';
import { invalid } from './app-error';
import type { MembershipDirectory } from './membership-directory';
import type { Metrics } from './ports';

// ---------------------------------------------------------------- request shapes (CON-001)

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const dateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'must be a date-time');

export const mutationSchema = z.strictObject({
  mutationId: uuid,
  // Known types come from the registry, so a type added there is accepted with no edit here.
  type: z.custom<RecordType>((v) => typeof v === 'string' && isRecordType(v), 'unknown type'),
  id: uuid,
  householdId: uuid,
  op: z.enum(['create', 'update', 'delete']),
  baseVersion: z.number().int().min(0),
  fields: z.record(z.string(), z.unknown()),
  clientTime: dateTime,
});
export type Mutation = z.infer<typeof mutationSchema>;

export const pushSchema = z.strictObject({
  clientId: uuid,
  mutations: z.array(mutationSchema).min(1).max(MAX_MUTATIONS_PER_PUSH),
});

export type RejectCode =
  | 'notFound'
  | 'forbidden'
  | 'invalid'
  | 'invalidReference'
  | 'duplicate'
  | 'deleted'
  | 'appendOnlyUpdate'
  | 'tooLarge';

export interface PushResult {
  mutationId: string;
  status: 'applied' | 'merged' | 'rejected';
  record?: RecordEnvelope;
  conflictIds?: string[];
  error?: { code: RejectCode; message: string; path?: string };
}

/** A single mutation's `fields` larger than this is refused as tooLarge. */
export const MAX_FIELDS_BYTES = 64 * 1024;

export interface SyncServiceDeps {
  unitOfWork: UnitOfWork;
  directory: MembershipDirectory;
  metrics: Metrics;
  newId: () => string;
  clock: () => Date;
  /**
   * Called inside the mutation's transaction for every record whose version changed, so
   * scheduled notifications are re-derived atomically (slice 11 supplies the real one).
   */
  onRecordChanged?: (repositories: Repositories, record: RecordEnvelope) => Promise<void>;
}

export type Pending = { changes: ChangeLogEntry[]; conflicts: ConflictRow[] };

export const pointer = (path: readonly PropertyKey[]): string =>
  path.length === 0 ? '' : '/' + path.map(String).join('/');

export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code === '23505' || e.cause?.code === '23505';
}

// ---------------------------------------------------------------- cursor (CON-002 2.4)

export function encodeCursor(seq: number): string {
  return Buffer.from(JSON.stringify({ v: 1, seq: String(seq) })).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = z
      .object({
        v: z.literal(1),
        seq: z.union([z.string().regex(/^\d+$/), z.number().int().min(0)]),
      })
      .parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    return Number(parsed.seq);
  } catch {
    throw invalid('cursor is not valid', '/cursor');
  }
}

export function reject(
  m: Mutation,
  code: RejectCode,
  message: string,
  path?: string,
  extra: Partial<PushResult> = {},
): PushResult {
  return {
    mutationId: m.mutationId,
    status: 'rejected',
    ...extra,
    error: { code, message, ...(path === undefined ? {} : { path }) },
  };
}

export function dataToColumns(
  type: RecordType,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columnsOf(type).data)) {
    if (key in data) out[key] = toColumnValue(column, data[key]);
  }
  return out;
}

export function change(
  m: Mutation,
  version: number,
  op: ChangeLogEntry['op'],
  changedFields: string[],
  actor: string,
): ChangeLogEntry {
  return {
    householdId: m.householdId,
    recordType: m.type,
    recordId: m.id,
    version,
    op,
    changedFields,
    actor,
  };
}

export function newConflict(
  ids: { newId: () => string; clock: () => Date },
  m: Mutation,
  householdId: string,
  field: string | null,
  keptValue: unknown,
  replacedValue: unknown,
  replacedBy: string,
  winningBy: string,
  reason: ConflictRow['reason'],
): ConflictRow {
  return {
    id: ids.newId(),
    householdId,
    recordType: m.type,
    recordId: m.id,
    field,
    keptValue,
    replacedValue,
    replacedBy,
    winningBy,
    reason,
    createdAt: ids.clock(),
    resolvedAt: null,
    resolvedBy: null,
  };
}

export function presentConflict(c: ConflictRow) {
  return {
    id: c.id,
    householdId: c.householdId,
    recordType: c.recordType,
    recordId: c.recordId,
    field: c.field,
    keptValue: c.keptValue ?? null,
    replacedValue: c.replacedValue ?? null,
    replacedBy: c.replacedBy,
    winningBy: c.winningBy,
    reason: c.reason,
    createdAt: iso(c.createdAt),
    resolvedAt: c.resolvedAt ? iso(c.resolvedAt) : null,
  };
}
