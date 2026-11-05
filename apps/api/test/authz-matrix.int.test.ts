import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ACTORS, clientFor, createPeople, shareHousehold } from './support/world';
import type { Actor, People } from './support/world';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { createTestDatabase } from './support/test-db';
import type { TestDatabase } from './support/test-db';

/**
 * QA-07 (REST endpoints; the sync endpoints join in slice 6): for every endpoint and every
 * actor, the status matches the permission model. Non-members get 404, never 403; anonymous
 * callers get 401.
 */
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

interface Context {
  householdId: string;
  inviteId: string;
}
interface Row {
  name: string;
  request: (c: Context) => {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    body?: unknown;
  };
  expect: Record<Actor, number>;
}

const owner = 200;
const members = (
  ownerStatus: number,
  caretaker: number,
  viewer: number,
): Record<Actor, number> => ({
  owner: ownerStatus,
  caretaker,
  viewer,
  outsider: 404,
  anonymous: 401,
});
const h = (c: Context) => `/api/households/${c.householdId}`;

const rows: Row[] = [
  {
    name: 'renameHousehold',
    request: (c) => ({ method: 'PATCH', url: h(c), body: { name: 'New name' } }),
    expect: members(owner, 403, 403),
  },
  {
    name: 'listMembers',
    request: (c) => ({ method: 'GET', url: `${h(c)}/members` }),
    expect: members(200, 200, 200),
  },
  {
    name: 'changeMemberRole (target: the viewer)',
    request: (c) => ({
      method: 'PATCH',
      url: `${h(c)}/members/${people.viewer.userId}`,
      body: { role: 'caretaker' },
    }),
    expect: members(200, 403, 403),
  },
  {
    name: 'removeMember (target: the viewer)',
    request: (c) => ({ method: 'DELETE', url: `${h(c)}/members/${people.viewer.userId}` }),
    expect: members(204, 403, 403),
  },
  {
    name: 'transferOwnership (to the caretaker)',
    request: (c) => ({
      method: 'POST',
      url: `${h(c)}/transfer-ownership`,
      body: { userId: people.caretaker.userId },
    }),
    expect: members(200, 403, 403),
  },
  {
    name: 'listInvites',
    request: (c) => ({ method: 'GET', url: `${h(c)}/invites` }),
    expect: members(200, 403, 403),
  },
  {
    name: 'createInvite',
    request: (c) => ({ method: 'POST', url: `${h(c)}/invites`, body: { role: 'viewer' } }),
    expect: members(201, 403, 403),
  },
  {
    name: 'revokeInvite',
    request: (c) => ({ method: 'DELETE', url: `${h(c)}/invites/${c.inviteId}` }),
    expect: members(204, 403, 403),
  },
  {
    // Last owner with other members cannot leave; everyone else can.
    name: 'leaveHousehold',
    request: (c) => ({ method: 'POST', url: `${h(c)}/leave`, body: {} }),
    expect: members(409, 204, 204),
  },
  {
    name: 'deleteHousehold',
    request: (c) => ({ method: 'DELETE', url: h(c), body: { confirmName: 'Shared home' } }),
    expect: members(204, 403, 403),
  },
];

describe('REST authorization matrix (QA-07)', () => {
  for (const row of rows) {
    describe(row.name, () => {
      for (const actor of ACTORS) {
        it(`${actor} -> ${row.expect[actor]}`, async () => {
          const { householdId } = await shareHousehold(people, world());
          const invite = await people.owner.client.post(`/api/households/${householdId}/invites`, {
            role: 'viewer',
          });
          const context: Context = { householdId, inviteId: invite.json().id };
          const { method, url, body } = row.request(context);
          const res = await clientFor(people, api, actor).request(method, url, body);
          expect(res.statusCode).toBe(row.expect[actor]);
          if (res.statusCode === 404) expect(res.json().code).toBe('notFound');
          if (res.statusCode === 401) expect(res.json().code).toBe('unauthenticated');
          if (res.statusCode === 403) expect(res.json().code).toBe('forbidden');
        });
      }
    });
  }

  describe('endpoints that need only a session', () => {
    for (const [name, method, url, body, ok] of [
      ['listHouseholds', 'GET', '/api/households', undefined, 200],
      ['createHousehold', 'POST', '/api/households', { name: 'Matrix home' }, 201],
      ['getMe', 'GET', '/api/me', undefined, 200],
    ] as const) {
      it(`${name}: any signed-in user ${ok}, anonymous 401`, async () => {
        for (const actor of ['owner', 'caretaker', 'viewer', 'outsider'] as const) {
          expect((await people[actor].client.request(method, url, body)).statusCode).toBe(ok);
        }
        expect(
          (await clientFor(people, api, 'anonymous').request(method, url, body)).statusCode,
        ).toBe(401);
      });
    }
  });
});
