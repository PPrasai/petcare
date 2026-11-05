import { v7 as uuidv7 } from 'uuid';
import type { RecordType } from '@petcare/domain';
import type { RemoteApi } from '../../application/ports/remote-api';
import type { RecordStore, StoredRecord } from '../../application/ports/record-store';
import type { SyncControl } from '../../application/ports/sync-control';
import { LocalDb } from './local-db';
import type { HouseholdRow, LocalRecord } from './local-db';
import { createSyncEngine } from '../sync/engine';
import type { SyncEngine, SyncStatus } from '../sync/engine';
import { LocalStore } from '../sync/local-store';
import type { FileApi } from '../../application/ports/file-api';
import type { FileGateway } from '../../application/ports/file-gateway';
import { clearFileCaches } from './file-cache';
import { createFileGateway } from './file-access';

export interface UserData {
  records: RecordStore;
  sync: SyncControl;
  engine: SyncEngine;
  files: FileGateway;
  households(): Promise<HouseholdRow[]>;
  /** Closes the database and deletes it and every cached file (sign-out). */
  wipe(): Promise<void>;
  close(): void;
}

export interface UserDataHooks {
  onChanged(types: string[]): void;
  onStatus(status: SyncStatus): void;
}

const present = (r: LocalRecord): StoredRecord => ({
  id: r.id,
  type: r.type,
  householdId: r.householdId,
  version: r.version,
  createdBy: r.createdBy,
  updatedAt: r.updatedAt,
  deletedAt: r.deletedAt,
  pending: r._pending === true,
  data: r.data,
});

/** Opens (creating if needed) the signed-in user's database and wires the sync engine to it. */
export function openUserData(
  userId: string,
  remote: RemoteApi,
  fileApi: FileApi,
  hooks: UserDataHooks,
): UserData {
  const db = new LocalDb(userId);
  const clock = { now: () => new Date() };
  const ids = { next: () => uuidv7() };
  const engine = createSyncEngine({
    db,
    remote,
    clock,
    ids,
    onChanged: hooks.onChanged,
    files: { api: fileApi, userId },
  });
  engine.subscribe(hooks.onStatus);
  const store = new LocalStore({
    db,
    clock,
    ids,
    actorId: userId,
    onWrite: (types: RecordType[]) => {
      hooks.onChanged(types);
      void engine.refreshPending();
    },
  });

  const records: RecordStore = {
    async list(type, householdId) {
      const rows = await db.records(type).where('householdId').equals(householdId).toArray();
      return rows.map(present);
    },
    async get(type, id) {
      const row = await store.get(type, id);
      return row ? present(row) : undefined;
    },
    async create(type, householdId, data) {
      return present(await store.create(type, householdId, data));
    },
    async update(type, id, fields) {
      return present(await store.update(type, id, fields));
    },
    remove: (type, id) => store.remove(type, id),
  };

  const sync: SyncControl = {
    async syncNow() {
      return (await engine.sync()).error;
    },
    pendingCount: () => db.outbox.count(),
    async problems() {
      const rows = await db.problems.orderBy('id').reverse().toArray();
      return rows.map((p) => ({
        id: p.id ?? 0,
        at: p.at,
        code: p.code,
        recordType: p.type,
        recordId: p.recordId,
        message: p.message,
      }));
    },
  };

  return {
    records,
    sync,
    engine,
    files: createFileGateway(db, fileApi, userId, () => hooks.onChanged([])),
    households: () => db.households.toArray(),
    async wipe() {
      await db.wipe();
      await clearFileCaches();
    },
    close: () => db.close(),
  };
}
