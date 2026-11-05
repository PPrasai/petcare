import pg from 'pg';
import { ApiClient, uniqueEmail } from './api-client';
import type { TestApp } from './test-app';

export type Actor = 'owner' | 'caretaker' | 'viewer' | 'outsider' | 'anonymous';
export const ACTORS: Actor[] = ['owner', 'caretaker', 'viewer', 'outsider', 'anonymous'];

export interface Person {
  client: ApiClient;
  userId: string;
  email: string;
}

/** Four real signed-up people. Households are created per test with `shareHousehold`. */
export async function createPeople(api: TestApp, origin?: string) {
  const make = async (label: string): Promise<Person> => {
    const client = new ApiClient(api, origin);
    const email = uniqueEmail(label);
    const res = await client.signUp(email, `${label} Person`);
    if (res.statusCode !== 200) throw new Error(`sign-up failed: ${res.body}`);
    const me = (await client.get('/api/me')).json();
    return { client, userId: me.user.id as string, email };
  };
  return {
    owner: await make('owner'),
    caretaker: await make('caretaker'),
    viewer: await make('viewer'),
    outsider: await make('outsider'),
  };
}
export type People = Awaited<ReturnType<typeof createPeople>>;

/**
 * A new household owned by `people.owner`, with the caretaker and viewer as members and the
 * outsider not. Members are inserted directly: the invite flow has its own rate limit (10 joins
 * per user per hour) and its own tests (invites.int.test.ts).
 */
export async function shareHousehold(
  people: People,
  context: { api: TestApp; databaseUrl: string },
  name = 'Shared home',
) {
  const created = await people.owner.client.post('/api/households', { name });
  if (created.statusCode !== 201) throw new Error(`create failed: ${created.body}`);
  const householdId = created.json().id as string;
  const client = new pg.Client({ connectionString: context.databaseUrl });
  await client.connect();
  try {
    for (const role of ['caretaker', 'viewer'] as const) {
      await client.query(
        'INSERT INTO memberships (household_id, user_id, role) VALUES ($1, $2, $3)',
        [householdId, people[role].userId, role],
      );
    }
  } finally {
    await client.end();
  }
  await context.api.forgetMemberships(people.caretaker.userId, people.viewer.userId);
  return { householdId, name };
}

export function clientFor(people: People, api: TestApp, actor: Actor): ApiClient {
  return actor === 'anonymous' ? new ApiClient(api) : people[actor].client;
}
