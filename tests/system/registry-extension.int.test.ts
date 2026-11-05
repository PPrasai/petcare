import { entities, defineEntity, note, shortText } from '@petcare/domain';
import type { RecordType } from '@petcare/domain';
import { integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { beforeAll, describe, expect, it } from 'vitest';
import { registerRecordTable } from '../../apps/api/src/server';
import { localSnapshot, serverSnapshot } from './support/compare';
import { useSystemWorld } from './support/harness';

// QA-13b: a test-only record type syncs end to end with nothing changed outside the three
// places a new type touches: its entity (domain registry), its table, and the sync registry.
const TYPE = 'testNote' as RecordType;

const testNote = defineEntity({
  type: TYPE,
  kind: 'mergeable',
  schema: z.strictObject({ title: shortText, body: note.optional() }),
  refs: {},
  fileRefs: [],
  indexes: ['title'],
});

const testNotes = pgTable('test_notes', {
  id: uuid('id').primaryKey(),
  householdId: uuid('household_id').notNull(),
  version: integer('version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  createdBy: text('created_by').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  updatedBy: text('updated_by').notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  title: text('title').notNull(),
  body: text('body'),
});

const world = useSystemWorld();

beforeAll(async () => {
  entities.push(testNote); // 1. the domain registry
  registerRecordTable(TYPE, testNotes); // 3. the sync registry
  await world.query(`CREATE TABLE test_notes (
    id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    version integer NOT NULL, created_at timestamptz NOT NULL, created_by text NOT NULL,
    updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
    title text NOT NULL, body text)`); // 2. the table
});

describe('a record type added through the registries', () => {
  it('creates, updates, deletes and syncs between two devices with no other change', async () => {
    const a = await world.newDevice('hana');
    const b = await world.newDevice('ivan');
    const householdId = await world.shareHousehold(a, [b]);

    const created = await a.store.create(TYPE, householdId, { title: 'First', body: 'hello' });
    await a.store.update(TYPE, created.id, { body: 'hello again' });
    await a.engine.sync();
    await b.engine.sync();
    expect(await b.db.records(TYPE).get(created.id)).toMatchObject({
      version: 1,
      data: { title: 'First', body: 'hello again' },
    });

    await b.store.update(TYPE, created.id, { title: 'Renamed' });
    await b.engine.sync();
    await a.engine.sync();
    expect((await a.db.records(TYPE).get(created.id))?.data).toMatchObject({ title: 'Renamed' });

    await a.store.remove(TYPE, created.id);
    await a.engine.sync();
    await b.engine.sync();
    expect((await b.db.records(TYPE).get(created.id))?.deletedAt).not.toBeNull();

    const server = await serverSnapshot(a);
    expect(await localSnapshot(a)).toEqual(server);
    expect(await localSnapshot(b)).toEqual(server);

    const log = await world.query('SELECT op FROM change_log WHERE record_id = $1 ORDER BY seq', [
      created.id,
    ]);
    expect(log.map((l) => l.op)).toEqual(['create', 'update', 'delete']);
  });

  it('rejects invalid data for the new type using its own schema', async () => {
    const a = await world.newDevice('jade');
    const householdId = (await a.session.request('GET', '/api/me')).json().households[0]
      .id as string;
    await a.store.create(TYPE, householdId, { title: '' });
    await a.engine.sync();
    expect(await a.db.records(TYPE).count()).toBe(0);
    expect((await a.db.problems.toArray()).map((p) => p.code)).toEqual(['invalid']);
  });
});
