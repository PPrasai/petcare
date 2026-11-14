import { DEMO_SEED, resolveDemoRecords } from '@petcare/domain';
import type { RecordType } from '@petcare/domain';
import type { FileApi } from '../../application/ports/file-api';
import { NetworkError } from '../../application/ports/remote-api';
import type { RemoteApi } from '../../application/ports/remote-api';
import { clearFileCaches } from './file-cache';
import { LocalDb } from './local-db';

export const DEMO_USER_ID = DEMO_SEED.user.id;
export const DEMO_USER = DEMO_SEED.user;
export const DEMO_HOUSEHOLD = { ...DEMO_SEED.household, role: 'owner' as const };
const SEEDED = 'demoSeeded';

const toBlob = (base64: string, mimeType: string): Blob => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
};

/**
 * Fills the demo database from the seed, with dates relative to today, unless it is already
 * filled. The sample files are kept as on-device uploads, exactly like a file chosen offline.
 */
export async function seedDemo(now: Date = new Date()): Promise<void> {
  const db = new LocalDb(DEMO_USER_ID);
  try {
    if (await db.meta.get(SEEDED)) return;
    try {
      await fill(db, now, true);
    } catch (error) {
      // Some browsers (WebKit in an ephemeral session, for one) refuse to store a Blob in
      // IndexedDB. The demo still opens, without its sample files.
      if (!(error instanceof Error) || !/blob/i.test(`${error.name} ${error.message}`)) throw error;
      await fill(db, now, false);
    }
  } finally {
    db.close();
  }
}

async function fill(db: LocalDb, now: Date, withFiles: boolean): Promise<void> {
  const records = resolveDemoRecords(now);
  const types = [...new Set(records.map((r) => r.type))] as RecordType[];
  await db.transaction(
    'rw',
    [...db.recordTables(), db.households, db.pendingFiles, db.meta],
    async () => {
      for (const type of types) {
        await db.records(type).bulkPut(records.filter((r) => r.type === type));
      }
      await db.households.put({
        id: DEMO_HOUSEHOLD.id,
        name: DEMO_HOUSEHOLD.name,
        role: 'owner',
      });
      if (withFiles) {
        await db.pendingFiles.bulkPut(
          DEMO_SEED.files.map((f) => ({
            id: f.id,
            householdId: DEMO_HOUSEHOLD.id,
            name: f.name,
            mimeType: f.mimeType,
            blob: toBlob(f.base64, f.mimeType),
          })),
        );
      }
      await db.meta.put({ key: SEEDED, value: now.toISOString() });
    },
  );
}

/** Deletes the demo database and its cached files. */
export async function wipeDemo(): Promise<void> {
  await new LocalDb(DEMO_USER_ID).wipe();
  await clearFileCaches();
}

const refuse = () => async (): Promise<never> => {
  throw new NetworkError('demo mode');
};

/** A server that is never reachable: the demo's sync engine can run but never sends anything. */
export const unreachableRemote = (): RemoteApi =>
  new Proxy({}, { get: refuse }) as unknown as RemoteApi;

export const unreachableFiles = (): FileApi => new Proxy({}, { get: refuse }) as unknown as FileApi;
