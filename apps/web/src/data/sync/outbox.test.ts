import 'fake-indexeddb/auto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalDb } from '../local/local-db';
import type { OutboxEntry } from '../local/local-db';
import { enqueue, entriesFor, nextBatch } from './outbox';

// CON-petcare-002 I-13: coalescing and create+delete elimination.
let db: LocalDb;
beforeEach(async () => {
  db = new LocalDb('u1', { indexedDB: new IDBFactory(), IDBKeyRange });
  await db.open();
});
afterEach(() => db.close());

const ID = '0197c8a0-0000-7000-8000-000000000001';
const HID = '0197c8a0-0000-7000-8000-0000000000aa';
let n = 0;
const entry = (
  op: OutboxEntry['op'],
  fields: Record<string, unknown>,
  extra: Partial<OutboxEntry> = {},
): OutboxEntry => ({
  mutationId: `0197c8a0-0000-7000-8000-${String(++n).padStart(12, '0')}`,
  type: 'pet',
  id: ID,
  householdId: HID,
  op,
  baseVersion: 0,
  fields,
  clientTime: `2026-06-01T10:00:0${n % 10}Z`,
  ...extra,
});

describe('coalescing updates', () => {
  it('merges consecutive unsent updates keeping the earliest baseVersion and latest clientTime', async () => {
    await enqueue(db, entry('update', { name: 'A', diet: 'x' }, { baseVersion: 3 }));
    const outcome = await enqueue(
      db,
      entry(
        'update',
        { name: 'B', breed: 'y' },
        { baseVersion: 5, clientTime: '2026-06-01T11:00:00Z' },
      ),
    );
    expect(outcome).toBe('coalesced');
    const rows = await entriesFor(db, 'pet', ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fields: { name: 'B', diet: 'x', breed: 'y' },
      baseVersion: 3,
      clientTime: '2026-06-01T11:00:00Z',
    });
  });

  it('folds an update into an unsent create so one create goes out', async () => {
    await enqueue(db, entry('create', { name: 'Momo', species: 'dog' }));
    await enqueue(db, entry('update', { name: 'Momo II' }));
    const rows = await entriesFor(db, 'pet', ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ op: 'create', fields: { name: 'Momo II', species: 'dog' } });
  });

  it('never changes an entry that is in flight', async () => {
    await enqueue(db, entry('update', { name: 'A' }, { baseVersion: 1, sending: true }));
    const outcome = await enqueue(db, entry('update', { name: 'B' }, { baseVersion: 1 }));
    expect(outcome).toBe('added');
    expect(await entriesFor(db, 'pet', ID)).toHaveLength(2);
  });

  it('does not merge updates of different records', async () => {
    await enqueue(db, entry('update', { name: 'A' }));
    await enqueue(
      db,
      entry('update', { name: 'B' }, { id: '0197c8a0-0000-7000-8000-000000000002' }),
    );
    expect(await db.outbox.count()).toBe(2);
  });
});

describe('create then delete', () => {
  it('removes every entry of the record when the create was never sent', async () => {
    await enqueue(db, entry('create', { name: 'Momo', species: 'dog' }));
    await enqueue(db, entry('update', { name: 'Momo II' }));
    const outcome = await enqueue(db, entry('delete', {}));
    expect(outcome).toBe('eliminated');
    expect(await db.outbox.count()).toBe(0);
  });

  it('keeps the delete when the create is already in flight', async () => {
    await enqueue(db, entry('create', { name: 'Momo', species: 'dog' }, { sending: true }));
    const outcome = await enqueue(db, entry('delete', {}));
    expect(outcome).toBe('added');
    expect(await db.outbox.count()).toBe(2);
  });

  it('keeps a delete of a server record (no create in the outbox)', async () => {
    await enqueue(db, entry('update', { name: 'A' }, { baseVersion: 2 }));
    const outcome = await enqueue(db, entry('delete', {}, { baseVersion: 2 }));
    expect(outcome).toBe('added');
    expect((await nextBatch(db, 10)).map((e) => e.op)).toEqual(['update', 'delete']);
  });
});

describe('order', () => {
  it('sends entries first-in first-out and honours the batch size', async () => {
    for (let i = 0; i < 5; i += 1) {
      await enqueue(
        db,
        entry(
          'create',
          { name: `p${i}`, species: 'dog' },
          {
            id: `0197c8a0-0000-7000-8000-00000000010${i}`,
          },
        ),
      );
    }
    const batch = await nextBatch(db, 3);
    expect(batch.map((e) => e.fields.name)).toEqual(['p0', 'p1', 'p2']);
  });
});
