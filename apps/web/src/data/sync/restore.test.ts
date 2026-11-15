import 'fake-indexeddb/auto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDb } from '../local/local-db';
import { LocalStore } from './local-store';

// Undo of a delete (RecordStore.restore): it never rewrites what the outbox already sent.
let db: LocalDb;
let store: LocalStore;
let n = 0;
const data = { name: 'Dr Vet', role: 'vet' };
beforeEach(async () => {
  db = new LocalDb('u1', { indexedDB: new IDBFactory(), IDBKeyRange });
  await db.open();
  n = 0;
  store = new LocalStore({
    db,
    clock: { now: () => new Date('2026-06-01T10:00:00Z') },
    ids: { next: () => `id-${++n}` },
    actorId: 'u1',
  });
});

/** Pretends the server has taken the record and the outbox is empty. */
async function settle(type: 'contact', id: string) {
  await db.outbox.clear();
  const row = await db.records(type).get(id);
  if (row) await db.records(type).put({ ...row, _pending: false, version: 1 });
}

describe('restore', () => {
  it('withdraws a delete that is still queued, so the server hears nothing', async () => {
    const created = await store.create('contact', 'h1', data);
    await settle('contact', created.id);
    await store.remove('contact', created.id);
    expect((await db.outbox.toArray()).map((o) => o.op)).toEqual(['delete']);

    const back = await store.restore('contact', created.id, 'h1', data);
    expect(back.id).toBe(created.id);
    expect(back.deletedAt).toBeNull();
    expect(await db.outbox.count()).toBe(0);
    expect((await db.records('contact').get(created.id))?.deletedAt).toBeNull();
  });

  it('writes a record whose create was never sent again, under the same id', async () => {
    const created = await store.create('contact', 'h1', data);
    await store.remove('contact', created.id);
    expect(await db.records('contact').count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);

    const back = await store.restore('contact', created.id, 'h1', data);
    expect(back.id).toBe(created.id);
    expect((await db.outbox.toArray()).map((o) => [o.op, o.id])).toEqual([['create', created.id]]);
    expect((await db.records('contact').get(created.id))?.data).toEqual(data);
  });

  it('brings back the data as a new record once the delete has been sent', async () => {
    const created = await store.create('contact', 'h1', data);
    await settle('contact', created.id);
    await store.remove('contact', created.id);
    // The delete went out: its outbox entry is gone but the local row stays a tombstone.
    await db.outbox.clear();

    const back = await store.restore('contact', created.id, 'h1', data);
    expect(back.id).not.toBe(created.id);
    expect(back.data).toEqual(data);
    expect((await db.outbox.toArray()).map((o) => [o.op, o.id])).toEqual([['create', back.id]]);
  });

  it('does not touch a delete that is in flight; the data returns as a new record', async () => {
    const created = await store.create('contact', 'h1', data);
    await settle('contact', created.id);
    await store.remove('contact', created.id);
    const [entry] = await db.outbox.toArray();
    if (!entry) throw new Error('no outbox entry');
    await db.outbox.put({ ...entry, sending: true });

    const back = await store.restore('contact', created.id, 'h1', data);
    expect(back.id).not.toBe(created.id);
    expect((await db.outbox.toArray()).map((o) => o.op)).toEqual(['delete', 'create']);
  });

  it('calls onWrite so lists refresh', async () => {
    const seen: string[][] = [];
    const s = new LocalStore({
      db,
      clock: { now: () => new Date() },
      ids: { next: () => `x-${++n}` },
      actorId: 'u1',
      onWrite: (types) => seen.push(types),
    });
    const created = await s.create('contact', 'h1', data);
    await s.remove('contact', created.id);
    await s.restore('contact', created.id, 'h1', data);
    expect(seen.at(-1)).toEqual(['contact']);
    expect(seen.length).toBe(3);
  });
});
