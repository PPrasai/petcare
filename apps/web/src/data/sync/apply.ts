import { entities } from '@petcare/domain';
import type { RecordEnvelope } from '@petcare/domain';
import type { PullPage, PushResult } from '../../application/ports/remote-api';
import type { LocalDb, LocalRecord, OutboxEntry } from '../local/local-db';
import { entriesFor } from './outbox';

/** Every table a sync step may touch, so one transaction covers records, outbox and cursor. */
export function syncTables(db: LocalDb) {
  return [db.outbox, db.households, db.conflicts, db.problems, db.meta, ...db.recordTables()];
}

export const CURSOR_KEY = 'cursor';
/** Record types a pull delivered that this bundle does not know (CON-petcare-003 2.5.1). */
export const UNKNOWN_TYPES_KEY = 'unknownTypes';

export const registryTypes = (): Set<string> => new Set(entities.map((e) => e.type as string));

/** The record types this bundle skipped in earlier pulls, oldest first. */
export async function unknownTypes(db: LocalDb): Promise<string[]> {
  const row = await db.meta.get(UNKNOWN_TYPES_KEY);
  return Array.isArray(row?.value) ? (row.value as string[]) : [];
}

/**
 * Re-pull after an upgrade (tolerant reader): when a type skipped earlier is now in the
 * registry, the cursor goes back to the start so those records are fetched, and the list is
 * cleared. Types that are still unknown stay listed. Returns whether the cursor was reset.
 */
export async function reconcileUnknownTypes(
  db: LocalDb,
  known: ReadonlySet<string> = registryTypes(),
): Promise<boolean> {
  const listed = await unknownTypes(db);
  const nowKnown = listed.filter((type) => known.has(type));
  if (nowKnown.length === 0) return false;
  const stillUnknown = listed.filter((type) => !known.has(type));
  await db.transaction('rw', db.meta, async () => {
    await db.meta.delete(CURSOR_KEY);
    if (stillUnknown.length > 0) await db.meta.put({ key: UNKNOWN_TYPES_KEY, value: stillUnknown });
    else await db.meta.delete(UNKNOWN_TYPES_KEY);
  });
  return true;
}

/** The server envelope with the unsent local edits laid back on top, for display. */
export function withPending(server: RecordEnvelope, pending: OutboxEntry[]): LocalRecord {
  if (pending.length === 0) return { ...server, _pending: false };
  let data = { ...server.data };
  let deletedAt = server.deletedAt;
  for (const entry of pending) {
    if (entry.op === 'delete') deletedAt = entry.clientTime;
    else data = { ...data, ...entry.fields };
  }
  return { ...server, data, deletedAt, _pending: true };
}

export interface PullApplyResult {
  changedTypes: Set<string>;
  seen: string[];
}

/**
 * Applies one pull page and persists its cursor in the same transaction (2.5.3, 2.5.4).
 * Households absent from the snapshot are removed with all their local records.
 */
export async function applyPullPage(
  db: LocalDb,
  page: PullPage,
  known: ReadonlySet<string> = registryTypes(),
): Promise<PullApplyResult> {
  const changedTypes = new Set<string>();
  const seen: string[] = [];
  await db.transaction('rw', syncTables(db), async () => {
    const keep = new Set(page.households.map((h) => h.id));
    await db.households.clear();
    await db.households.bulkPut(page.households);
    for (const entity of entities) {
      const table = db.records(entity.type);
      const gone = await table.filter((r) => !keep.has(r.householdId)).primaryKeys();
      if (gone.length > 0) {
        await table.bulkDelete(gone);
        changedTypes.add(entity.type);
      }
    }
    await db.outbox.filter((e) => !keep.has(e.householdId)).delete();
    await db.conflicts.filter((c) => !keep.has(c.householdId)).delete();

    // Tolerant reader: a record of a type this bundle does not know is skipped and its type
    // noted, so the cursor still advances and the rest of the page is applied.
    const skipped = new Set<string>();
    for (const change of page.changes) {
      if (!known.has(change.type)) {
        skipped.add(change.type);
        continue;
      }
      const pending = await entriesFor(db, change.type, change.id);
      await db.records(change.type).put(withPending(change, pending));
      changedTypes.add(change.type);
      seen.push(change.id);
    }
    const conflicts = page.conflicts.filter((c) => known.has(c.recordType));
    for (const conflict of page.conflicts) {
      if (!known.has(conflict.recordType)) skipped.add(conflict.recordType);
    }
    if (conflicts.length > 0) await db.conflicts.bulkPut(conflicts);
    if (skipped.size > 0) {
      const listed = new Set(await unknownTypes(db));
      for (const type of skipped) listed.add(type);
      await db.meta.put({ key: UNKNOWN_TYPES_KEY, value: [...listed] });
    }
    await db.meta.put({ key: CURSOR_KEY, value: page.cursor });
  });
  return { changedTypes, seen };
}

const isMissing = (code: string) => code === 'notFound' || code === 'forbidden';

/**
 * Applies push results (2.5.2). Applied and merged results replace the local record; rejected
 * ones are dropped and noted as sync problems. Entries queued after a confirmed mutation are
 * rebased onto the version it produced.
 */
export async function applyPushResults(
  db: LocalDb,
  batch: OutboxEntry[],
  results: PushResult[],
  now: string,
): Promise<Set<string>> {
  const changedTypes = new Set<string>();
  const byId = new Map(results.map((r) => [r.mutationId, r]));
  await db.transaction('rw', syncTables(db), async () => {
    for (const sent of batch) {
      const result = byId.get(sent.mutationId);
      if (!result) {
        // The server did not report on it: let it go out again.
        if (sent.seq !== undefined) await db.outbox.update(sent.seq, { sending: false });
        continue;
      }
      if (sent.seq !== undefined) await db.outbox.delete(sent.seq);
      changedTypes.add(sent.type);
      const rest = await entriesFor(db, sent.type, sent.id);
      const table = db.records(sent.type);

      if (result.record) {
        const record = result.record;
        for (const entry of rest) {
          if (entry.seq !== undefined && entry.baseVersion < record.version) {
            await db.outbox.update(entry.seq, { baseVersion: record.version });
          }
        }
        await table.put(withPending(record, rest));
      } else if (result.status === 'rejected') {
        const local = await table.get(sent.id);
        const neverOnServer = local !== undefined && local.version === 0;
        if (local && (isMissing(result.error?.code ?? '') || neverOnServer)) {
          await table.delete(sent.id);
          await db.outbox.where('[type+id]').equals([sent.type, sent.id]).delete();
        } else if (local && rest.length === 0) {
          await table.put({ ...local, _pending: false });
        }
      }
      if (result.status === 'rejected') {
        await db.problems.add({
          at: now,
          mutationId: sent.mutationId,
          type: sent.type,
          recordId: sent.id,
          code: result.error?.code ?? 'unknown',
          message: result.error?.message ?? '',
        });
      }
    }
  });
  return changedTypes;
}
