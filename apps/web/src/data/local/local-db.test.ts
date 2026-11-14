import 'fake-indexeddb/auto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { entities } from '@petcare/domain';
import { LocalDb } from './local-db';

// Adding a record type to the domain registry must give the device a table for it.
describe('LocalDb', () => {
  it('has a table for every registry type', async () => {
    const db = new LocalDb('u1', { indexedDB: new IDBFactory(), IDBKeyRange });
    await db.open();
    const names = new Set(db.tables.map((t) => t.name));
    for (const entity of entities) expect(names, entity.type).toContain(entity.type);
    expect(entities).toHaveLength(19);
    db.close();
  });

  it('upgrades a version 2 database in place, keeping its records and adding the v3 tables', async () => {
    const indexedDB = new IDBFactory();
    const old = new Dexie('petcare-u-u1', { indexedDB, IDBKeyRange });
    const v2 = Object.fromEntries(
      entities
        .filter((e) => e.type !== 'careLog' && e.type !== 'mealPreset')
        .map((e) => [
          e.type,
          ['id', 'householdId', 'deletedAt', ...e.indexes.map((i) => `data.${i}`)].join(', '),
        ]),
    );
    old.version(2).stores({
      ...v2,
      outbox: '++seq, mutationId, [type+id], householdId',
      households: 'id',
      conflicts: 'id, householdId, [recordType+recordId]',
      problems: '++id',
      meta: 'key',
      pendingFiles: 'id, householdId',
    });
    await old.open();
    await old
      .table('pet')
      .put({ id: 'p1', householdId: 'h', deletedAt: null, data: { name: 'Momo' } });
    old.close();

    const db = new LocalDb('u1', { indexedDB, IDBKeyRange });
    await db.open();
    expect(await db.records('pet').get('p1')).toBeDefined();
    expect(await db.records('careLog').count()).toBe(0);
    expect(await db.records('mealPreset').count()).toBe(0);
    db.close();
  });
});
