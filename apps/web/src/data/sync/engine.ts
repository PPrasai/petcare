import { MAX_MUTATIONS_PER_PUSH, PULL_LIMIT_DEFAULT, entities } from '@petcare/domain';
import { NetworkError, RemoteError, isCursorExpired } from '../../application/ports/remote-api';
import type { PushMutation, RemoteApi } from '../../application/ports/remote-api';
import type { Clock, IdGenerator } from '../../application/ports/runtime';
import type { LocalDb, OutboxEntry } from '../local/local-db';
import { CURSOR_KEY, applyPullPage, applyPushResults, syncTables } from './apply';
import { nextBatch, pendingCount } from './outbox';

export interface SyncStatus {
  online: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  syncing: boolean;
  error: string | null;
}

export interface SyncEngineDeps {
  db: LocalDb;
  remote: RemoteApi;
  clock: Clock;
  ids: IdGenerator;
  /** Called with the record types that changed locally, so Query can invalidate them. */
  onChanged?: (types: string[]) => void;
}

export interface SyncEngine {
  /** Push the outbox, then pull until caught up. Concurrent calls share one run. */
  sync(): Promise<SyncStatus>;
  getStatus(): SyncStatus;
  subscribe(listener: (status: SyncStatus) => void): () => void;
  /** Recount the outbox after a local write. */
  refreshPending(): Promise<void>;
}

/** Builds the sync engine (CON-petcare-002 2.5). Public entry point for tests/system. */
export function createSyncEngine(deps: SyncEngineDeps): SyncEngine {
  const { db, remote, clock, ids } = deps;
  const clientId = ids.next();
  let status: SyncStatus = {
    online: true,
    pendingCount: 0,
    lastSyncedAt: null,
    syncing: false,
    error: null,
  };
  const listeners = new Set<(s: SyncStatus) => void>();
  let running: Promise<SyncStatus> | null = null;
  let again = false;

  const setStatus = (patch: Partial<SyncStatus>) => {
    status = { ...status, ...patch };
    for (const listener of listeners) listener(status);
  };
  const changed = (types: Iterable<string>) => {
    const list = [...types];
    if (list.length > 0) deps.onChanged?.(list);
  };

  async function pushAll(): Promise<void> {
    for (;;) {
      const batch = await nextBatch(db, MAX_MUTATIONS_PER_PUSH);
      if (batch.length === 0) return;
      await db.outbox.bulkUpdate(
        batch.flatMap((e) =>
          e.seq === undefined ? [] : [{ key: e.seq, changes: { sending: true } }],
        ),
      );
      let response;
      try {
        response = await remote.push({ clientId, mutations: batch.map(toMutation) });
      } catch (error) {
        await db.outbox.bulkUpdate(
          batch.flatMap((e) =>
            e.seq === undefined ? [] : [{ key: e.seq, changes: { sending: false } }],
          ),
        );
        throw error;
      }
      changed(await applyPushResults(db, batch, response.results, clock.now().toISOString()));
      await refreshPending();
    }
  }

  async function pullAll(): Promise<void> {
    let cursor = ((await db.meta.get(CURSOR_KEY))?.value as string | undefined) || undefined;
    let rebuild: Set<string> | null = null;
    for (;;) {
      let page;
      try {
        page = await remote.pull(cursor, PULL_LIMIT_DEFAULT);
      } catch (error) {
        if (!isCursorExpired(error) || rebuild) throw error;
        rebuild = new Set();
        cursor = undefined;
        continue;
      }
      const applied = await applyPullPage(db, page);
      changed(applied.changedTypes);
      for (const id of applied.seen) rebuild?.add(id);
      cursor = page.cursor;
      if (!page.hasMore) break;
    }
    if (rebuild) await dropUnseen(rebuild);
  }

  /** After a full re-pull, local records the server no longer reports are removed. */
  async function dropUnseen(seen: Set<string>): Promise<void> {
    const types = new Set<string>();
    await db.transaction('rw', syncTables(db), async () => {
      for (const entity of entities) {
        const table = db.records(entity.type);
        const stale = await table.filter((r) => !seen.has(r.id) && !r._pending).primaryKeys();
        if (stale.length > 0) {
          await table.bulkDelete(stale);
          types.add(entity.type);
        }
      }
    });
    changed(types);
  }

  async function refreshPending(): Promise<void> {
    setStatus({ pendingCount: await pendingCount(db) });
  }

  async function run(): Promise<SyncStatus> {
    setStatus({ syncing: true });
    try {
      await pushAll();
      await pullAll();
      setStatus({ online: true, error: null, lastSyncedAt: clock.now().toISOString() });
    } catch (error) {
      if (error instanceof NetworkError) setStatus({ online: false, error: error.message });
      else if (error instanceof RemoteError) setStatus({ error: error.code });
      else setStatus({ error: error instanceof Error ? error.message : 'sync failed' });
    } finally {
      setStatus({ syncing: false });
      await refreshPending();
    }
    return status;
  }

  return {
    sync() {
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        try {
          let result = await run();
          while (again && result.error === null) {
            again = false;
            result = await run();
          }
          return result;
        } finally {
          again = false;
          running = null;
        }
      })();
      return running;
    },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refreshPending,
  };
}

function toMutation(entry: OutboxEntry): PushMutation {
  const { mutationId, type, id, householdId, op, baseVersion, fields, clientTime } = entry;
  return { mutationId, type, id, householdId, op, baseVersion, fields, clientTime };
}
