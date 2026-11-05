import {
  MAX_MUTATIONS_PER_PUSH,
  PULL_LIMIT_DEFAULT,
  PULL_LIMIT_MAX,
  RECORD_TYPES,
  can,
  getEntity,
} from '@petcare/domain';
import type { RecordEnvelope, RecordType } from '@petcare/domain';
import { z } from 'zod';
import {
  columnsOf,
  fromColumnValue,
  iso,
  sameStoredValue,
  toColumnValue,
  toEnvelope,
  typesWithPetId,
} from '../repositories';
import type { ChangeLogEntry, ConflictRow, Repositories, UnitOfWork } from '../repositories';
import { AppError, forbidden, invalid, notFound } from './app-error';
import type { MembershipDirectory } from './membership-directory';
import type { Metrics } from './ports';

// ---------------------------------------------------------------- request shapes (CON-001)

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const dateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'must be a date-time');

const mutationSchema = z.strictObject({
  mutationId: uuid,
  type: z.enum(RECORD_TYPES),
  id: uuid,
  householdId: uuid,
  op: z.enum(['create', 'update', 'delete']),
  baseVersion: z.number().int().min(0),
  fields: z.record(z.string(), z.unknown()),
  clientTime: dateTime,
});
export type Mutation = z.infer<typeof mutationSchema>;

const pushSchema = z.strictObject({
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
const MAX_FIELDS_BYTES = 64 * 1024;

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

type Pending = { changes: ChangeLogEntry[]; conflicts: ConflictRow[] };

const pointer = (path: readonly PropertyKey[]): string =>
  path.length === 0 ? '' : '/' + path.map(String).join('/');

function isUniqueViolation(error: unknown): boolean {
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

// ---------------------------------------------------------------- service

export function createSyncService(deps: SyncServiceDeps) {
  const { unitOfWork, directory, metrics, newId, clock } = deps;
  const onRecordChanged = deps.onRecordChanged ?? (async () => undefined);

  function reject(
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

  /** Checks every reference in `values` (same household, not deleted). Returns the first problem. */
  async function checkReferences(
    tx: Repositories,
    m: Mutation,
    entity: ReturnType<typeof getEntity>,
    values: Record<string, unknown>,
    keys: string[],
  ): Promise<{ message: string; path: string } | null> {
    for (const [field, refType] of Object.entries(entity.refs)) {
      const value = values[field];
      if (!keys.includes(field) || typeof value !== 'string') continue;
      if (!(await tx.records.existsLive(refType, value, m.householdId))) {
        return { message: `${field} not found in household`, path: `/${field}` };
      }
    }
    for (const field of entity.fileRefs) {
      const value = values[field];
      if (!keys.includes(field) || value === null || value === undefined) continue;
      for (const fileId of Array.isArray(value) ? value : [value]) {
        if (typeof fileId === 'string' && !(await tx.sync.liveFile(fileId, m.householdId))) {
          return { message: `${field} file not found in household`, path: `/${field}` };
        }
      }
    }
    if (m.type === 'reminderSnooze' && keys.some((k) => k === 'sourceId' || k === 'sourceType')) {
      const ok = await tx.records.existsLive(
        values.sourceType as RecordType,
        String(values.sourceId),
        m.householdId,
      );
      if (!ok) return { message: 'sourceId not found in household', path: '/sourceId' };
    }
    if (m.type === 'document' && values.linkedRecordType && values.linkedRecordId) {
      const ok = await tx.records.existsLive(
        values.linkedRecordType as RecordType,
        String(values.linkedRecordId),
        m.householdId,
      );
      if (!ok) return { message: 'linkedRecordId not found in household', path: '/linkedRecordId' };
    }
    return null;
  }

  function dataToColumns(type: RecordType, data: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(columnsOf(type).data)) {
      if (key in data) out[key] = toColumnValue(column, data[key]);
    }
    return out;
  }

  // One mutation, inside its transaction. Data is written immediately; conflicts and change-log
  // rows are collected in `pending` and written last, under the change-log lock.
  async function decide(
    tx: Repositories,
    actor: string,
    m: Mutation,
    pending: Pending,
  ): Promise<PushResult> {
    const entity = getEntity(m.type);
    const now = clock();
    const existing = await tx.records.findForUpdate(m.type, m.id);

    // 2. Authorisation. A record never moves between households (resolves ISS-CON2-01).
    if (existing && existing.householdId !== m.householdId)
      return reject(m, 'notFound', 'not found');
    const role = await directory.roleOf(actor, m.householdId);
    if (!role) return reject(m, 'notFound', 'not found');
    if (!existing && m.op !== 'create') return reject(m, 'notFound', 'record not found');

    const createAsUpdate = m.op === 'create' && existing !== null;
    const op = createAsUpdate ? 'update' : m.op;
    const fieldKeys = Object.keys(m.fields);
    const allowed = can(role, op, m.type, {
      actorId: actor,
      ...(existing ? { createdBy: existing.createdBy } : {}),
      fields: fieldKeys,
    });
    if (!allowed) return reject(m, 'forbidden', 'not allowed');
    if (m.type === 'reminderSnooze' && m.op === 'create' && m.fields.userId !== actor) {
      return reject(m, 'forbidden', 'a snooze belongs to the user who made it', '/userId');
    }
    if (JSON.stringify(m.fields).length > MAX_FIELDS_BYTES) {
      return reject(m, 'tooLarge', 'fields are too large');
    }

    // Append-only types: no updates. A repeated create of an existing event is a no-op.
    if (entity.kind === 'appendOnly' && op === 'update') {
      if (createAsUpdate && existing) {
        return {
          mutationId: m.mutationId,
          status: 'applied',
          record: toEnvelope(m.type, existing),
        };
      }
      return reject(m, 'appendOnlyUpdate', `${m.type} records cannot be updated`);
    }

    // 3. Validation.
    const currentData = existing ? toEnvelope(m.type, existing).data : {};
    let data: Record<string, unknown> = {};
    if (m.op !== 'delete') {
      data = m.op === 'create' && !existing ? m.fields : { ...currentData, ...m.fields };
      const parsed = entity.schema.safeParse(data);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return reject(m, 'invalid', issue?.message ?? 'invalid', pointer(issue?.path ?? []));
      }
      const problem = await checkReferences(
        tx,
        m,
        entity,
        data,
        m.op === 'create' && !existing ? Object.keys(data) : fieldKeys,
      );
      if (problem) return reject(m, 'invalidReference', problem.message, problem.path);
      if (
        m.type === 'emergencyCard' &&
        (!existing || 'petId' in m.fields) &&
        (await tx.records.liveCardForPet(String(data.petId), m.id))
      ) {
        return reject(m, 'duplicate', 'this pet already has an emergency card', '/petId');
      }
    }

    // 4. Apply.
    const record = async (row: Awaited<ReturnType<typeof tx.records.insert>>) => {
      const envelope = toEnvelope(m.type, row);
      await onRecordChanged(tx, envelope);
      return envelope;
    };

    if (!existing) {
      const row = await tx.records.insert(m.type, {
        id: m.id,
        householdId: m.householdId,
        version: 1,
        createdAt: now,
        createdBy: actor,
        updatedAt: now,
        updatedBy: actor,
        deletedAt: null,
        ...dataToColumns(m.type, data),
      });
      pending.changes.push(change(m, 1, 'create', ['*'], actor));
      return { mutationId: m.mutationId, status: 'applied', record: await record(row) };
    }

    if (op === 'delete') {
      if (existing.deletedAt) {
        return {
          mutationId: m.mutationId,
          status: 'applied',
          record: toEnvelope(m.type, existing),
        };
      }
      const row = await tx.records.update(m.type, m.id, {
        deletedAt: now,
        version: existing.version + 1,
        updatedAt: now,
        updatedBy: actor,
      });
      pending.changes.push(change(m, row.version, 'delete', ['*'], actor));
      if (m.type === 'pet') await cascadeDelete(tx, m, actor, now, pending);
      return { mutationId: m.mutationId, status: 'applied', record: await record(row) };
    }

    // update (or create of an existing id, treated as an update with baseVersion 0)
    const baseVersion = createAsUpdate ? 0 : m.baseVersion;
    if (existing.deletedAt) {
      // Delete wins; the update is kept as a conflict so nothing is silently lost.
      const conflict = newConflict(
        m,
        existing.householdId,
        null,
        null,
        m.fields,
        actor,
        existing.updatedBy,
        'updateAfterDelete',
      );
      pending.conflicts.push(conflict);
      return reject(m, 'deleted', 'the record was deleted', undefined, {
        record: toEnvelope(m.type, existing),
        conflictIds: [conflict.id],
      });
    }

    const columns = columnsOf(m.type).data;
    const changedKeys = Object.keys(m.fields).filter((key) => {
      const column = columns[key];
      return column ? !sameStoredValue(column, existing[key] ?? null, m.fields[key]) : false;
    });
    if (changedKeys.length === 0) {
      return { mutationId: m.mutationId, status: 'applied', record: toEnvelope(m.type, existing) };
    }

    const since = await tx.sync.changesAfter(m.id, baseVersion);
    const conflictIds: string[] = [];
    for (const key of changedKeys) {
      const lastSetter = since.find(
        (c) => c.changedFields.includes(key) || c.changedFields.includes('*'),
      );
      if (!lastSetter) continue;
      const column = columns[key];
      const conflict = newConflict(
        m,
        existing.householdId,
        key,
        m.fields[key],
        column ? fromColumnValue(column, existing[key] ?? null) : null,
        lastSetter.actor,
        actor,
        'concurrentFieldEdit',
      );
      pending.conflicts.push(conflict);
      conflictIds.push(conflict.id);
    }

    const row = await tx.records.update(m.type, m.id, {
      ...dataToColumns(m.type, Object.fromEntries(changedKeys.map((k) => [k, m.fields[k]]))),
      version: existing.version + 1,
      updatedAt: now,
      updatedBy: actor,
    });
    pending.changes.push(change(m, row.version, 'update', changedKeys, actor));
    return {
      mutationId: m.mutationId,
      status: conflictIds.length > 0 ? 'merged' : 'applied',
      record: await record(row),
      ...(conflictIds.length > 0 ? { conflictIds } : {}),
    };
  }

  function change(
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

  function newConflict(
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
      id: newId(),
      householdId,
      recordType: m.type,
      recordId: m.id,
      field,
      keptValue,
      replacedValue,
      replacedBy,
      winningBy,
      reason,
      createdAt: clock(),
      resolvedAt: null,
      resolvedBy: null,
    };
  }

  /** Deleting a pet tombstones everything that belongs to it, in the same transaction. */
  async function cascadeDelete(
    tx: Repositories,
    m: Mutation,
    actor: string,
    now: Date,
    pending: Pending,
  ): Promise<void> {
    for (const type of typesWithPetId) {
      const rows = (await tx.records.liveByPetForUpdate(type, m.id)).filter(
        (r) => r.householdId === m.householdId,
      );
      for (const row of rows) {
        const updated = await tx.records.update(type, row.id, {
          deletedAt: now,
          version: row.version + 1,
          updatedAt: now,
          updatedBy: actor,
        });
        pending.changes.push({
          householdId: m.householdId,
          recordType: type,
          recordId: row.id,
          version: updated.version,
          op: 'delete',
          changedFields: ['*'],
          actor,
        });
        await onRecordChanged(tx, toEnvelope(type, updated));
      }
      if (type === 'emergencyCard') await tx.sync.removeEmergencyTokens(rows.map((r) => r.id));
    }
  }

  async function applyInTransaction(actor: string, m: Mutation): Promise<PushResult> {
    return unitOfWork.run(async (tx) => {
      // 1. Idempotency: a replayed mutationId returns the first result unchanged.
      const stored = await tx.sync.findMutation(m.mutationId);
      if (stored) {
        if (stored.userId === actor) return stored.result as PushResult;
        return reject(m, 'invalid', 'mutationId already used', '/mutationId');
      }
      const pending: Pending = { changes: [], conflicts: [] };
      const result = await decide(tx, actor, m, pending);
      await tx.sync.storeMutation(m.mutationId, actor, result);
      if (pending.changes.length > 0 || pending.conflicts.length > 0) {
        // seq order must equal commit order, or a pull could skip a change that commits late.
        await tx.sync.lockChangeLog();
        await tx.sync.insertConflicts(pending.conflicts);
        await tx.sync.appendChanges(pending.changes);
      }
      return result;
    });
  }

  async function applyOne(actor: string, m: Mutation): Promise<PushResult> {
    let result: PushResult;
    try {
      result = await applyInTransaction(actor, m);
    } catch (error) {
      // Two requests raced on the same new id or the same mutationId: the loser re-runs and
      // sees the winner's rows.
      if (!isUniqueViolation(error)) throw error;
      result = await applyInTransaction(actor, m);
    }
    metrics.syncMutation(result.status);
    if (result.conflictIds?.length) metrics.syncConflicts(m.type, result.conflictIds.length);
    return result;
  }

  return {
    /** POST /api/sync/push: mutations run in array order, each in its own transaction. */
    async push(actor: string, body: unknown) {
      const request = pushSchema.parse(body);
      const results: PushResult[] = [];
      for (const mutation of request.mutations) results.push(await applyOne(actor, mutation));
      return { results, serverTime: iso(clock()) };
    },

    /** GET /api/sync/pull: the current envelope of every record changed after the cursor. */
    async pull(userId: string, query: { cursor?: string; limit?: string | number }) {
      const limit = z.coerce
        .number()
        .int()
        .min(1)
        .max(PULL_LIMIT_MAX)
        .default(PULL_LIMIT_DEFAULT)
        .safeParse(query.limit ?? undefined);
      if (!limit.success) throw invalid('limit must be 1-1000', '/limit');
      const after = decodeCursor(query.cursor);

      const repos = unitOfWork.repositories;
      const households = await repos.households.listForUser(userId);
      const householdIds = households.map((h) => h.id);

      if (after > 0) {
        // Rows older than the retention horizon are purged; a cursor behind them is unusable.
        const oldest = await repos.sync.oldestSeq();
        if (oldest !== null && after < oldest - 1) {
          throw new AppError('cursorExpired', 410, 'pull again from an empty cursor');
        }
      }

      const rows = await repos.sync.changedRecords(householdIds, after, limit.data + 1);
      const hasMore = rows.length > limit.data;
      const page = rows.slice(0, limit.data);

      const byType = new Map<RecordType, string[]>();
      for (const r of page) {
        const type = r.recordType as RecordType;
        byType.set(type, [...(byType.get(type) ?? []), r.recordId]);
      }
      const envelopes = new Map<string, RecordEnvelope>();
      for (const [type, ids] of byType) {
        for (const row of await repos.records.findMany(type, ids)) {
          envelopes.set(`${type}:${row.id}`, toEnvelope(type, row));
        }
      }
      const changes = page
        .map((r) => envelopes.get(`${r.recordType}:${r.recordId}`))
        .filter((e): e is RecordEnvelope => e !== undefined);

      const since = after > 0 ? await repos.sync.changeTimeAt(after) : null;
      const conflicts = await repos.sync.unresolvedConflicts(householdIds, since);
      const last = page.at(-1);

      return {
        changes,
        households,
        conflicts: conflicts.map(presentConflict),
        cursor: encodeCursor(last ? last.lastSeq : after),
        hasMore,
        serverTime: iso(clock()),
      };
    },

    /** POST /api/conflicts/:id/resolve: acknowledge a conflict (owner or caretaker). */
    async resolveConflict(userId: string, conflictId: string) {
      const repos = unitOfWork.repositories;
      const conflict = await repos.sync.findConflict(conflictId);
      if (!conflict) throw notFound();
      const role = await directory.requireMember(userId, conflict.householdId);
      if (role === 'viewer') throw forbidden();
      await repos.sync.resolveConflict(conflictId, userId, clock());
      const resolved = await repos.sync.findConflict(conflictId);
      if (!resolved) throw notFound();
      return presentConflict(resolved);
    },
  };
}
export type SyncService = ReturnType<typeof createSyncService>;

function presentConflict(c: ConflictRow) {
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
