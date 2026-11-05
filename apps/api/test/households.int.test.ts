import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createPeople, shareHousehold } from './support/world';
import type { People } from './support/world';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { createTestDatabase } from './support/test-db';
import type { TestDatabase } from './support/test-db';

let database: TestDatabase;
let api: TestApp;
let people: People;
const world = () => ({ api, databaseUrl: database.url });

beforeAll(async () => {
  database = await createTestDatabase();
  api = await createTestApp(
    testConfig({ DATABASE_URL: database.url, REDIS_URL: inject('redisUrl') }),
  );
  people = await createPeople(api);
});
afterAll(async () => {
  await api.close();
  await database.drop();
});

const base = (id: string) => `/api/households/${id}`;

describe('create, list, rename', () => {
  it('creates a household with the caller as owner', async () => {
    const res = await people.owner.client.post('/api/households', { name: '  Our Home  ' });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: 'Our Home', role: 'owner', memberCount: 1 });
    const list = await people.owner.client.get('/api/households');
    expect(list.json().map((h: { id: string }) => h.id)).toContain(res.json().id);
    // The outsider does not see it.
    const other = await people.outsider.client.get('/api/households');
    expect(other.json().map((h: { id: string }) => h.id)).not.toContain(res.json().id);
  });

  it('rejects empty, long and unknown-key input with 400 invalid', async () => {
    const c = people.owner.client;
    expect((await c.post('/api/households', { name: '   ' })).statusCode).toBe(400);
    expect((await c.post('/api/households', { name: 'x'.repeat(101) })).statusCode).toBe(400);
    expect((await c.post('/api/households', { name: 'ok', extra: 1 })).statusCode).toBe(400);
  });

  it('renames (owner only)', async () => {
    const { householdId } = await shareHousehold(people, world());
    const renamed = await people.owner.client.request('PATCH', base(householdId), {
      name: 'Renamed',
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().name).toBe('Renamed');
    const denied = await people.caretaker.client.request('PATCH', base(householdId), {
      name: 'Nope',
    });
    expect(denied.statusCode).toBe(403);
  });

  it('answers 404 for a malformed or unknown household id', async () => {
    const c = people.owner.client;
    expect((await c.get('/api/households/not-a-uuid/members')).statusCode).toBe(404);
    expect(
      (await c.get('/api/households/01930f6e-0000-7000-8000-00000000dead/members')).statusCode,
    ).toBe(404);
  });
});

describe('members', () => {
  it('lists members for any role, never for an outsider', async () => {
    const { householdId } = await shareHousehold(people, world());
    const res = await people.viewer.client.get(`${base(householdId)}/members`);
    expect(res.statusCode).toBe(200);
    const members = res.json() as { userId: string; role: string; name: string }[];
    expect(members.map((m) => m.role).sort()).toEqual(['caretaker', 'owner', 'viewer']);
    expect(members.find((m) => m.userId === people.owner.userId)?.name).toBe('owner Person');
    expect((await people.outsider.client.get(`${base(householdId)}/members`)).statusCode).toBe(404);
  });

  it('changes a role, but not your own, an owner, or a non-member', async () => {
    const { householdId } = await shareHousehold(people, world());
    const owner = people.owner.client;
    const ok = await owner.request(
      'PATCH',
      `${base(householdId)}/members/${people.viewer.userId}`,
      {
        role: 'caretaker',
      },
    );
    expect(ok.statusCode).toBe(200);
    expect(ok.json().role).toBe('caretaker');
    const self = await owner.request(
      'PATCH',
      `${base(householdId)}/members/${people.owner.userId}`,
      {
        role: 'viewer',
      },
    );
    expect(self.statusCode).toBe(400);
    const stranger = await owner.request(
      'PATCH',
      `${base(householdId)}/members/${people.outsider.userId}`,
      {
        role: 'viewer',
      },
    );
    expect(stranger.statusCode).toBe(404);
    const badRole = await owner.request(
      'PATCH',
      `${base(householdId)}/members/${people.viewer.userId}`,
      {
        role: 'owner',
      },
    );
    expect(badRole.statusCode).toBe(400);
  });

  it('the new role takes effect at once (membership cache is invalidated)', async () => {
    const { householdId } = await shareHousehold(people, world());
    // The viewer reads (and so caches) the household, then is promoted.
    expect((await people.viewer.client.get(`${base(householdId)}/invites`)).statusCode).toBe(403);
    await people.owner.client.request(
      'PATCH',
      `${base(householdId)}/members/${people.viewer.userId}`,
      {
        role: 'caretaker',
      },
    );
    const roleNow = (await people.viewer.client.get('/api/me'))
      .json()
      .households.find((h: { id: string }) => h.id === householdId).role;
    expect(roleNow).toBe('caretaker');
  });

  it('removes a member, who then gets 404 immediately', async () => {
    const { householdId } = await shareHousehold(people, world());
    expect((await people.viewer.client.get(`${base(householdId)}/members`)).statusCode).toBe(200);
    const removed = await people.owner.client.request(
      'DELETE',
      `${base(householdId)}/members/${people.viewer.userId}`,
    );
    expect(removed.statusCode).toBe(204);
    expect((await people.viewer.client.get(`${base(householdId)}/members`)).statusCode).toBe(404);
    const self = await people.owner.client.request(
      'DELETE',
      `${base(householdId)}/members/${people.owner.userId}`,
    );
    expect(self.statusCode).toBe(403);
  });
});

describe('leave', () => {
  it('lets a viewer or caretaker leave', async () => {
    const { householdId } = await shareHousehold(people, world());
    expect((await people.viewer.client.post(`${base(householdId)}/leave`)).statusCode).toBe(204);
    expect((await people.viewer.client.get(`${base(householdId)}/members`)).statusCode).toBe(404);
    expect((await people.caretaker.client.post(`${base(householdId)}/leave`)).statusCode).toBe(204);
  });

  it('refuses the last owner while other members exist (409 lastOwner)', async () => {
    const { householdId } = await shareHousehold(people, world());
    const res = await people.owner.client.post(`${base(householdId)}/leave`);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('lastOwner');
  });

  it('refuses a sole member too: delete the household instead', async () => {
    const created = await people.outsider.client.post('/api/households', { name: 'Just me' });
    const res = await people.outsider.client.post(`${base(created.json().id)}/leave`);
    expect(res.statusCode).toBe(409);
  });

  it('lets an owner leave once another owner exists', async () => {
    const { householdId } = await shareHousehold(people, world());
    await people.owner.client.post(`${base(householdId)}/transfer-ownership`, {
      userId: people.caretaker.userId,
    });
    // The old owner is now a caretaker and can leave; the new owner cannot (last owner).
    expect((await people.owner.client.post(`${base(householdId)}/leave`)).statusCode).toBe(204);
    expect((await people.caretaker.client.post(`${base(householdId)}/leave`)).statusCode).toBe(409);
  });
});

describe('transfer ownership', () => {
  it('makes the target owner and the caller a caretaker', async () => {
    const { householdId } = await shareHousehold(people, world());
    const res = await people.owner.client.post(`${base(householdId)}/transfer-ownership`, {
      userId: people.viewer.userId,
    });
    expect(res.statusCode).toBe(200);
    const roles = Object.fromEntries(
      (res.json() as { userId: string; role: string }[]).map((m) => [m.userId, m.role]),
    );
    expect(roles[people.viewer.userId]).toBe('owner');
    expect(roles[people.owner.userId]).toBe('caretaker');
    // Takes effect immediately for both.
    const oldOwner = await people.owner.client.request('PATCH', base(householdId), {
      name: 'Mine?',
    });
    expect(oldOwner.statusCode).toBe(403);
    const newOwner = await people.viewer.client.request('PATCH', base(householdId), {
      name: 'Theirs',
    });
    expect(newOwner.statusCode).toBe(200);
  });

  it('rejects yourself, a non-member and a missing userId', async () => {
    const { householdId } = await shareHousehold(people, world());
    const o = people.owner.client;
    expect(
      (await o.post(`${base(householdId)}/transfer-ownership`, { userId: people.owner.userId }))
        .statusCode,
    ).toBe(400);
    expect(
      (await o.post(`${base(householdId)}/transfer-ownership`, { userId: people.outsider.userId }))
        .statusCode,
    ).toBe(404);
    expect((await o.post(`${base(householdId)}/transfer-ownership`, {})).statusCode).toBe(400);
  });
});

describe('delete household', () => {
  it('needs the exact name, then removes it for everyone', async () => {
    const { householdId } = await shareHousehold(people, world(), 'Doomed home');
    const o = people.owner.client;
    expect(
      (await o.request('DELETE', base(householdId), { confirmName: 'wrong' })).statusCode,
    ).toBe(400);
    expect(
      (
        await people.caretaker.client.request('DELETE', base(householdId), {
          confirmName: 'Doomed home',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await o.request('DELETE', base(householdId), { confirmName: 'Doomed home' })).statusCode,
    ).toBe(204);
    for (const p of [people.owner, people.caretaker, people.viewer]) {
      expect((await p.client.get(`${base(householdId)}/members`)).statusCode).toBe(404);
    }
  });
});
