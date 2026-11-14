import 'fake-indexeddb/auto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalDb } from '../local/local-db';
import { LocalStore } from './local-store';

// RecordStore.createMany (CON-003 2.5.2, QA-29 atomicity part).
let db: LocalDb;
let store: LocalStore;
let n = 0;
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

describe('createMany', () => {
  it('writes every record and one outbox entry each, in order, in one transaction', async () => {
    const written = await store.createMany('h1', [
      { type: 'careLog', data: { petId: 'p', kind: 'walk', durationMin: 5 } },
      { type: 'reminderCompletion', data: { reminderId: 'r' } },
    ]);
    expect(written.map((r) => r.type)).toEqual(['careLog', 'reminderCompletion']);
    expect(await db.records('careLog').count()).toBe(1);
    expect(await db.records('reminderCompletion').count()).toBe(1);
    const outbox = await db.outbox.orderBy('seq').toArray();
    expect(outbox.map((o) => [o.type, o.op])).toEqual([
      ['careLog', 'create'],
      ['reminderCompletion', 'create'],
    ]);
    expect(new Set(outbox.map((o) => o.mutationId)).size).toBe(2);
    expect(outbox.map((o) => o.id)).toEqual(written.map((r) => r.id));
  });

  it('writes nothing when one of the writes fails', async () => {
    await expect(
      store.createMany('h1', [
        { type: 'careLog', data: { petId: 'p', kind: 'walk', durationMin: 5 } },
        // A function cannot be stored by IndexedDB: this write throws inside the transaction.
        { type: 'reminderCompletion', data: { bad: () => 1 } },
      ]),
    ).rejects.toBeDefined();
    expect(await db.records('careLog').count()).toBe(0);
    expect(await db.records('reminderCompletion').count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('calls onWrite once with the types it touched', async () => {
    const seen: string[][] = [];
    const s = new LocalStore({
      db,
      clock: { now: () => new Date() },
      ids: { next: () => `x-${++n}` },
      actorId: 'u1',
      onWrite: (types) => seen.push(types),
    });
    await s.createMany('h1', [
      { type: 'careLog', data: {} },
      { type: 'careLog', data: {} },
    ]);
    expect(seen).toEqual([['careLog']]);
  });
});
