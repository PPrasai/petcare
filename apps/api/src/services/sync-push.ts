import { can, getEntity } from '@petcare/domain';
import {
  columnsOf,
  fromColumnValue,
  iso,
  sameStoredValue,
  toEnvelope,
  typesWithPetId,
} from '../repositories';
import type { Repositories, Role } from '../repositories';
import { checkReferences } from './sync-references';
import {
  MAX_FIELDS_BYTES,
  change,
  dataToColumns,
  isUniqueViolation,
  newConflict,
  pointer,
  pushSchema,
  reject,
} from './sync-types';
import type { Mutation, Pending, PushResult, SyncServiceDeps } from './sync-types';

/** POST /api/sync/push: the algorithm of CON-petcare-002 section 2.3. */
export function createPushProcessor(deps: SyncServiceDeps) {
  const { unitOfWork, directory, metrics, newId, clock } = deps;
  const ids = { newId, clock };
  const onRecordChanged = deps.onRecordChanged ?? (async () => undefined);

  // One mutation, inside its transaction. Data is written immediately; conflicts and change-log
  // rows are collected in `pending` and written last, under the change-log lock.
  async function decide(
    tx: Repositories,
    actor: string,
    role: Role | null,
    m: Mutation,
    pending: Pending,
  ): Promise<PushResult> {
    const entity = getEntity(m.type);
    const now = clock();
    const existing = await tx.records.findForUpdate(m.type, m.id);

    // 2. Authorisation. A record never moves between households (resolves ISS-CON2-01).
    if (existing && existing.householdId !== m.householdId)
      return reject(m, 'notFound', 'not found');
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
    // CON-003 2.3: a "Just me" reminder can only name its author. Clearing it is always allowed.
    // The actor has a role here, so a matching id is also a current member (invalidReference
    // for a non-member id cannot be reached: it would already be forbidden).
    if (
      m.type === 'reminder' &&
      op !== 'delete' &&
      typeof m.fields.audienceUserId === 'string' &&
      m.fields.audienceUserId !== actor
    ) {
      return reject(
        m,
        'forbidden',
        'a Just me reminder can only be for its author',
        '/audienceUserId',
      );
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
        ids,
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
        ids,
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
    // Resolved before the transaction: on a cache miss it reads the database, and doing that
    // while this transaction holds a pooled connection can exhaust the pool under load.
    const role = await directory.roleOf(actor, m.householdId);
    return unitOfWork.run(async (tx) => {
      // 1. Idempotency: a replayed mutationId returns the first result unchanged.
      const stored = await tx.sync.findMutation(m.mutationId);
      if (stored) {
        if (stored.userId === actor) return stored.result as PushResult;
        return reject(m, 'invalid', 'mutationId already used', '/mutationId');
      }
      const pending: Pending = { changes: [], conflicts: [] };
      const result = await decide(tx, actor, role, m, pending);
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
    /** Mutations run in array order, each in its own transaction. */
    async push(actor: string, body: unknown) {
      const request = pushSchema.parse(body);
      const results: PushResult[] = [];
      for (const mutation of request.mutations) results.push(await applyOne(actor, mutation));
      return { results, serverTime: iso(clock()) };
    },
  };
}
