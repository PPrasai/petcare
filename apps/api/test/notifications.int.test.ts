import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '@petcare/domain';
import type { PushOutcome, PushPayload, PushSender, PushTarget } from '../src/services/ports';
import { ApiClient } from './support/api-client';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { createTestDatabase, sql } from './support/test-db';
import type { TestDatabase } from './support/test-db';
import { mutation, pushOne } from './support/sync-helpers';
import { createPeople, shareHousehold } from './support/world';
import type { People } from './support/world';

/** QA-04: reminder timeliness. A controlled clock and a fake push service. */
let now = new Date('2026-06-09T08:00:00Z');
const sent: { endpoint: string; payload: PushPayload }[] = [];
const gone = new Set<string>();

const fakePushService: PushSender = {
  async send(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
    if (gone.has(target.endpoint)) return { ok: false, gone: true };
    sent.push({ endpoint: target.endpoint, payload });
    return { ok: true };
  },
};

let database: TestDatabase;
let api: TestApp;
let people: People;
let householdId: string;
const endpoint = (who: string) => `https://push.example.test/${who}`;
const dispatch = () => api.app.notifications.dispatcher.dispatchDue();
const sentTo = (who: string) => sent.filter((s) => s.endpoint === endpoint(who));

beforeAll(async () => {
  database = await createTestDatabase();
  api = await createTestApp(
    testConfig({ DATABASE_URL: database.url, REDIS_URL: inject('redisUrl') }),
    undefined,
    { relaxRateLimits: true, pushSender: fakePushService, clock: () => now },
  );
  people = await createPeople(api);
  householdId = (await shareHousehold(people, { api, databaseUrl: database.url })).householdId;

  for (const who of ['owner', 'caretaker', 'viewer'] as const) {
    const client = people[who].client;
    const prefs = {
      ...DEFAULT_PREFERENCES,
      leadMinutes: { ...DEFAULT_PREFERENCES.leadMinutes, vaccination: 1440, reminder: 60 },
    };
    expect((await client.put('/api/me/preferences', prefs)).statusCode).toBe(200);
    if (who === 'viewer') continue; // opted in, but has no registered device
    const res = await client.post('/api/push/subscriptions', {
      endpoint: endpoint(who),
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    });
    expect(res.statusCode).toBe(201);
  }
});
afterAll(async () => {
  await api.close();
  await database.drop();
});

const owner = () => people.owner.client;
async function create(type: string, fields: Record<string, unknown>) {
  const m = mutation(householdId, type, 'create', fields);
  const result = await pushOne(owner(), m);
  expect(result.status).toBe('applied');
  return m.id;
}
const reminder = (title: string) =>
  create('reminder', {
    title,
    active: true,
    schedule: { tz: 'UTC', kind: 'once', times: ['10:00'], startOn: '2026-06-12' },
  });

describe('QA-04 reminder timeliness', () => {
  it('sends a vaccination reminder once to each opted-in member, one tick after fireAt', async () => {
    const petId = await create('pet', { name: 'Momo', species: 'dog' });
    await create('vaccination', {
      petId,
      vaccineName: 'Rabies',
      givenOn: '2025-06-11',
      nextDueOn: '2026-06-11',
    });

    // Due 2026-06-11 09:00 UTC with a 1-day lead: fires 2026-06-10 09:00 UTC.
    const rows = await api.app.notifications.dispatcher.dispatchDue();
    expect(rows.sent).toBe(0);
    const scheduled = await sql(
      database.url,
      "SELECT user_id, fire_at FROM scheduled_notifications WHERE source_type = 'vaccination' ORDER BY user_id",
    );
    expect(scheduled).toHaveLength(3); // owner, caretaker, viewer (all opted in)
    expect(new Date(String(scheduled[0]?.fire_at)).toISOString()).toBe('2026-06-10T09:00:00.000Z');

    now = new Date('2026-06-10T08:59:00Z');
    expect((await dispatch()).sent).toBe(0);
    expect(sent).toHaveLength(0);

    now = new Date('2026-06-10T09:00:30Z'); // within one tick (60 s) of fireAt
    await dispatch();
    expect(sentTo('owner')).toHaveLength(1);
    expect(sentTo('caretaker')).toHaveLength(1);
    expect(sentTo('owner')[0]?.payload.title).toBe('Vaccination due: Rabies');
    expect(sentTo('owner')[0]?.payload.body).toBe('Momo');

    // No duplicates on later ticks.
    now = new Date('2026-06-10T09:01:30Z');
    await dispatch();
    expect(sent).toHaveLength(2);
  });

  it('does not send completed or snoozed occurrences', async () => {
    now = new Date('2026-06-11T08:00:00Z');
    sent.length = 0;
    const done = await reminder('Completed reminder');
    const snoozed = await reminder('Snoozed reminder');
    await reminder('Plain reminder');
    const occurrenceAt = '2026-06-12T10:00:00Z';
    await create('reminderCompletion', {
      reminderId: done,
      occurrenceAt,
      completedAt: now.toISOString(),
    });
    await create('reminderSnooze', {
      sourceType: 'reminder',
      sourceId: snoozed,
      occurrenceAt,
      snoozedUntil: '2026-06-12T12:00:00Z',
      userId: people.owner.userId,
    });

    now = new Date('2026-06-12T09:00:30Z'); // fireAt = 10:00 - 60 min
    await dispatch();
    const titles = sentTo('owner').map((s) => s.payload.title);
    expect(titles).toEqual(['Plain reminder']);
    // The snooze is the owner's: the caretaker still gets the snoozed reminder.
    expect(
      sentTo('caretaker')
        .map((s) => s.payload.title)
        .sort(),
    ).toEqual(['Plain reminder', 'Snoozed reminder']);

    // After the snooze ends the owner gets it, once.
    now = new Date('2026-06-12T12:00:30Z');
    await dispatch();
    expect(sentTo('owner').map((s) => s.payload.title)).toEqual([
      'Plain reminder',
      'Snoozed reminder',
    ]);
  });

  it('deletes a subscription the push service reports as gone (410)', async () => {
    gone.add(endpoint('caretaker'));
    await create('reminder', {
      title: 'Another reminder',
      active: true,
      schedule: { tz: 'UTC', kind: 'once', times: ['10:00'], startOn: '2026-06-14' },
    });
    now = new Date('2026-06-14T09:00:30Z');
    const result = await dispatch();
    expect(result.removed).toBe(1);
    const left = await sql<{ endpoint: string }>(
      database.url,
      'SELECT endpoint FROM push_subscriptions ORDER BY endpoint',
    );
    expect(left.map((r) => r.endpoint)).toEqual([endpoint('owner')]);
  });

  it('removes unsent notifications when the source is deleted or paused', async () => {
    now = new Date('2026-06-20T08:00:00Z');
    const id = await create('reminder', {
      title: 'Soon gone',
      active: true,
      schedule: { tz: 'UTC', kind: 'once', times: ['10:00'], startOn: '2026-06-22' },
    });
    const count = () =>
      sql(database.url, 'SELECT 1 FROM scheduled_notifications WHERE source_id = $1', [id]).then(
        (r) => r.length,
      );
    expect(await count()).toBe(3);
    const paused = await pushOne(
      owner(),
      mutation(householdId, 'reminder', 'update', { active: false }, { id, baseVersion: 1 }),
    );
    expect(paused.status).toBe('applied');
    expect(await count()).toBe(0);
  });

  it('re-deriving (the nightly job) adds no duplicates', async () => {
    await dispatch(); // settles the retry left by the 410 test above
    const before = await sql(
      database.url,
      'SELECT count(*)::int AS n FROM scheduled_notifications',
    );
    await api.app.notifications.extend();
    const after = await sql(database.url, 'SELECT count(*)::int AS n FROM scheduled_notifications');
    expect(after[0]?.n).toBe(before[0]?.n);
  });
});

describe('push subscription routes', () => {
  it('registers idempotently, re-binds an endpoint to the caller, and unsubscribes', async () => {
    const body = { endpoint: 'https://push.example.test/shared', keys: { p256dh: 'a', auth: 'b' } };
    expect((await people.owner.client.post('/api/push/subscriptions', body)).statusCode).toBe(201);
    expect((await people.owner.client.post('/api/push/subscriptions', body)).statusCode).toBe(201);
    expect((await people.viewer.client.post('/api/push/subscriptions', body)).statusCode).toBe(201);
    const rows = await sql<{ user_id: string }>(
      database.url,
      'SELECT user_id FROM push_subscriptions WHERE endpoint = $1',
      [body.endpoint],
    );
    expect(rows.map((r) => r.user_id)).toEqual([people.viewer.userId]);

    // Someone else cannot remove it; the owner of it can; removing twice is fine.
    const del = (who: 'owner' | 'viewer') =>
      people[who].client.request('DELETE', '/api/push/subscriptions', { endpoint: body.endpoint });
    expect((await del('owner')).statusCode).toBe(204);
    expect(
      (
        await sql(database.url, 'SELECT 1 FROM push_subscriptions WHERE endpoint = $1', [
          body.endpoint,
        ])
      ).length,
    ).toBe(1);
    expect((await del('viewer')).statusCode).toBe(204);
    expect((await del('viewer')).statusCode).toBe(204);
  });

  it('refuses bad input and anonymous callers', async () => {
    const bad = await owner().post('/api/push/subscriptions', {
      endpoint: 'http://insecure.test/x',
      keys: { p256dh: 'a', auth: 'b' },
    });
    expect(bad.statusCode).toBe(400);
    const anonymous = new ApiClient(api);
    expect(
      (
        await anonymous.post('/api/push/subscriptions', {
          endpoint: 'https://push.example.test/anon',
          keys: { p256dh: 'a', auth: 'b' },
        })
      ).statusCode,
    ).toBe(401);
    expect((await anonymous.post('/api/push/test')).statusCode).toBe(401);
  });

  it('sends a test message to the caller and limits it to 5 an hour', async () => {
    sent.length = 0;
    const tester = people.outsider.client;
    await tester.post('/api/push/subscriptions', {
      endpoint: endpoint('outsider'),
      keys: { p256dh: 'a', auth: 'b' },
    });
    for (let i = 0; i < 5; i += 1)
      expect((await tester.post('/api/push/test')).statusCode).toBe(202);
    expect(sentTo('outsider')).toHaveLength(5);
    const sixth = await tester.post('/api/push/test');
    expect(sixth.statusCode).toBe(429);
    expect(sixth.headers['retry-after']).toBeDefined();
  });
});

describe('calendar feed', () => {
  it('creates a link once, serves an .ics feed, and stops working when revoked or replaced', async () => {
    now = new Date('2026-06-01T08:00:00Z');
    const c = people.owner.client;
    expect((await c.get('/api/calendar/link')).json()).toEqual({ exists: false, createdAt: null });

    const created = await c.post('/api/calendar/link');
    expect(created.statusCode).toBe(201);
    const { url } = created.json() as { url: string };
    const token = /\/cal\/([A-Za-z0-9_-]{43})\.ics$/.exec(url)?.[1] ?? '';
    expect(token).toHaveLength(43);
    expect((await c.get('/api/calendar/link')).json().exists).toBe(true);

    const anonymous = new ApiClient(api);
    const feed = await anonymous.get(`/cal/${token}.ics`);
    expect(feed.statusCode).toBe(200);
    expect(String(feed.headers['content-type'])).toContain('text/calendar');
    expect(feed.body).toContain('BEGIN:VCALENDAR');
    expect(feed.body).toContain('SUMMARY:Rabies (Momo)');
    expect(feed.body).toContain('BEGIN:VALARM');

    const replaced = (await c.post('/api/calendar/link')).json() as { url: string };
    expect(replaced.url).not.toBe(url);
    expect((await anonymous.get(`/cal/${token}.ics`)).statusCode).toBe(404);

    const newToken = /\/cal\/([A-Za-z0-9_-]{43})\.ics$/.exec(replaced.url)?.[1] ?? '';
    expect((await anonymous.get(`/cal/${newToken}.ics`)).statusCode).toBe(200);
    expect((await c.request('DELETE', '/api/calendar/link')).statusCode).toBe(204);
    expect((await anonymous.get(`/cal/${newToken}.ics`)).statusCode).toBe(404);
    expect((await anonymous.get('/cal/not-a-token.ics')).statusCode).toBe(404);
  });

  it("contains only the user's own households", async () => {
    const c = people.outsider.client;
    const { url } = (await c.post('/api/calendar/link')).json() as { url: string };
    const feed = await c.get(new URL(url).pathname);
    expect(feed.statusCode).toBe(200);
    expect(feed.body).not.toContain('Rabies');
  });
});
