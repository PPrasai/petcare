import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { createTestDatabase, sql } from './support/test-db';
import type { TestDatabase } from './support/test-db';
import { mutation, pushOne } from './support/sync-helpers';
import { createPeople, shareHousehold } from './support/world';
import type { People } from './support/world';

// CON-petcare-003 I-17 (notifications): a reminder with audienceUserId = U is scheduled for U only.
const now = new Date('2026-06-09T08:00:00Z');
let database: TestDatabase;
let api: TestApp;
let people: People;
let householdId: string;

beforeAll(async () => {
  database = await createTestDatabase();
  api = await createTestApp(
    testConfig({ DATABASE_URL: database.url, REDIS_URL: inject('redisUrl') }),
    undefined,
    { relaxRateLimits: true, clock: () => now },
  );
  people = await createPeople(api);
  householdId = (await shareHousehold(people, { api, databaseUrl: database.url })).householdId;
});
afterAll(async () => {
  await api.close();
  await database.drop();
});

async function reminder(title: string, extra: Record<string, unknown>) {
  const m = mutation(householdId, 'reminder', 'create', {
    title,
    active: true,
    schedule: { tz: 'UTC', kind: 'once', times: ['10:00'], startOn: '2026-06-12' },
    ...extra,
  });
  const result = await pushOne(people.owner.client, m);
  expect(result.status, JSON.stringify(result.error)).toBe('applied');
  return m.id;
}
const usersFor = async (id: string) =>
  (
    await sql<{ user_id: string }>(
      database.url,
      'SELECT user_id FROM scheduled_notifications WHERE source_id = $1 ORDER BY user_id',
      [id],
    )
  ).map((r) => r.user_id);

describe('notification audience (I-17)', () => {
  it('schedules a Just me reminder for that user only', async () => {
    const id = await reminder('Just me', { audienceUserId: people.owner.userId });
    expect(await usersFor(id)).toEqual([people.owner.userId]);
  });

  it('schedules a reminder with audience null, or none, for every member', async () => {
    const everyone = [people.owner.userId, people.caretaker.userId, people.viewer.userId].sort();
    expect(await usersFor(await reminder('Null', { audienceUserId: null }))).toEqual(everyone);
    expect(await usersFor(await reminder('Absent', {}))).toEqual(everyone);
  });

  it('re-derives when the audience is cleared', async () => {
    const id = await reminder('Cleared later', { audienceUserId: people.owner.userId });
    expect(await usersFor(id)).toHaveLength(1);
    const result = await pushOne(
      people.owner.client,
      mutation(householdId, 'reminder', 'update', { audienceUserId: null }, { id, baseVersion: 1 }),
    );
    expect(result.status).toBe('applied');
    expect(await usersFor(id)).toHaveLength(3);
  });
});
