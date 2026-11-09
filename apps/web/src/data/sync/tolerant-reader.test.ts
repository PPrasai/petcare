import 'fake-indexeddb/auto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RecordEnvelope } from '@petcare/domain';
import type { PullPage, RemoteApi } from '../../application/ports/remote-api';
import { LocalDb } from '../local/local-db';
import {
  CURSOR_KEY,
  UNKNOWN_TYPES_KEY,
  applyPullPage,
  reconcileUnknownTypes,
  registryTypes,
} from './apply';
import { createSyncEngine } from './engine';

// QA-37 / CON-petcare-003 2.5.1 (client obligation). CON-003 is not in the code yet, so the
// page is built by hand with a record type this bundle's registry has never heard of.
let db: LocalDb;
beforeEach(async () => {
  db = new LocalDb('u1', { indexedDB: new IDBFactory(), IDBKeyRange });
  await db.open();
});
afterEach(() => db.close());

const HID = '0197c8a0-0000-7000-8000-0000000000aa';
const envelope = (type: string, n: number, data: Record<string, unknown>): RecordEnvelope =>
  ({
    id: `0197c8a0-0000-7000-8000-${String(n).padStart(12, '0')}`,
    type,
    householdId: HID,
    version: 1,
    createdAt: '2026-06-01T10:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-06-01T10:00:00Z',
    updatedBy: 'u1',
    deletedAt: null,
    data,
  }) as unknown as RecordEnvelope;

const page = (cursor: string, changes: RecordEnvelope[]): PullPage => ({
  changes,
  households: [{ id: HID, name: 'Home', role: 'owner' }],
  conflicts: [],
  cursor,
  hasMore: false,
});

const FUTURE = 'zzFutureType';
const pet = envelope('pet', 1, { name: 'Momo', species: 'dog' });
const future = envelope(FUTURE, 2, { petId: pet.id, kind: 'meal' });

describe('tolerant reader', () => {
  it('skips an unknown type, applies the rest, advances the cursor and notes the type', async () => {
    const applied = await applyPullPage(db, page('c1', [future, pet]));
    expect(await db.records('pet').get(pet.id)).toMatchObject({ data: { name: 'Momo' } });
    expect(applied.changedTypes).toEqual(new Set(['pet']));
    expect((await db.meta.get(CURSOR_KEY))?.value).toBe('c1');
    expect((await db.meta.get(UNKNOWN_TYPES_KEY))?.value).toEqual([FUTURE]);
  });

  it('keeps the list free of repeats across pages', async () => {
    await applyPullPage(db, page('c1', [future]));
    await applyPullPage(db, page('c2', [envelope(FUTURE, 3, {})]));
    expect((await db.meta.get(UNKNOWN_TYPES_KEY))?.value).toEqual([FUTURE]);
  });

  it('does not stop the sync engine, which reports no error', async () => {
    const remote: RemoteApi = {
      push: () => Promise.reject(new Error('nothing to push')),
      pull: () => Promise.resolve(page('c9', [future, pet])),
    };
    const engine = createSyncEngine({
      db,
      remote,
      clock: { now: () => new Date('2026-06-01T10:00:00Z') },
      ids: { next: () => '0197c8a0-0000-7000-8000-0000000000bb' },
    });
    const status = await engine.sync();
    expect(status.error).toBeNull();
    expect((await db.meta.get(CURSOR_KEY))?.value).toBe('c9');
    expect(await db.records('pet').count()).toBe(1);
  });

  it('goes back to the start once the registry knows the type, then clears the list', async () => {
    await applyPullPage(db, page('c1', [future, pet]));
    // Still the same bundle: nothing to do.
    expect(await reconcileUnknownTypes(db)).toBe(false);
    expect((await db.meta.get(CURSOR_KEY))?.value).toBe('c1');

    // An upgraded bundle knows the type.
    const upgraded = new Set([...registryTypes(), FUTURE]);
    expect(await reconcileUnknownTypes(db, upgraded)).toBe(true);
    expect(await db.meta.get(CURSOR_KEY)).toBeUndefined();
    expect(await db.meta.get(UNKNOWN_TYPES_KEY)).toBeUndefined();
  });

  it('keeps types that are still unknown after an upgrade', async () => {
    await applyPullPage(db, page('c1', [future, envelope('zzOther', 4, {})]));
    await reconcileUnknownTypes(db, new Set([...registryTypes(), FUTURE]));
    expect((await db.meta.get(UNKNOWN_TYPES_KEY))?.value).toEqual(['zzOther']);
  });
});
