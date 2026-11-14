import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { createTestDatabase } from './support/test-db';
import type { TestDatabase } from './support/test-db';
import { mutation, pushOne } from './support/sync-helpers';
import { createPeople, shareHousehold } from './support/world';
import type { People } from './support/world';

// CON-petcare-003 I-17 (calendar): the feed of a user omits reminders that are for someone else.
const now = new Date('2026-06-09T08:00:00Z');
let database: TestDatabase;
let api: TestApp;
let people: People;

beforeAll(async () => {
  database = await createTestDatabase();
  api = await createTestApp(
    testConfig({ DATABASE_URL: database.url, REDIS_URL: inject('redisUrl') }),
    undefined,
    { relaxRateLimits: true, clock: () => now },
  );
  people = await createPeople(api);
  const { householdId } = await shareHousehold(people, { api, databaseUrl: database.url });
  const schedule = { tz: 'UTC', kind: 'once', times: ['10:00'], startOn: '2026-06-12' };
  for (const [title, extra] of [
    ['Owner only walk', { audienceUserId: people.owner.userId }],
    ['Shared dinner', { audienceUserId: null }],
  ] as const) {
    const result = await pushOne(
      people.owner.client,
      mutation(householdId, 'reminder', 'create', { title, active: true, schedule, ...extra }),
    );
    expect(result.status, JSON.stringify(result.error)).toBe('applied');
  }
});
afterAll(async () => {
  await api.close();
  await database.drop();
});

async function feedOf(who: 'owner' | 'caretaker'): Promise<string> {
  const client = people[who].client;
  const { url } = (await client.post('/api/calendar/link')).json() as { url: string };
  const feed = await client.get(new URL(url).pathname);
  expect(feed.statusCode).toBe(200);
  return feed.body;
}

describe('calendar audience (I-17)', () => {
  it('puts a Just me reminder in the author feed only', async () => {
    const owner = await feedOf('owner');
    expect(owner).toContain('SUMMARY:Owner only walk');
    expect(owner).toContain('SUMMARY:Shared dinner');
    const caretaker = await feedOf('caretaker');
    expect(caretaker).not.toContain('Owner only walk');
    expect(caretaker).toContain('SUMMARY:Shared dinner');
  });
});
