import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ApiClient, uniqueEmail } from './support/api-client';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { createTestDatabase } from './support/test-db';
import type { TestDatabase } from './support/test-db';

// QA-20: authentication security (a-e), plus sign-in basics and the personal household.
const HTTPS_ORIGIN = 'https://petcare.example.test';
let database: TestDatabase;
let api: TestApp;
/** The fake identity provider: whatever identity the test sets is what GitHub "returns". */
let fakeGithubUser = { id: 'gh-1', email: 'x@example.test', name: 'GH User', emailVerified: true };

beforeAll(async () => {
  database = await createTestDatabase();
  api = await createTestApp(
    testConfig({
      DATABASE_URL: database.url,
      REDIS_URL: inject('redisUrl'),
      APP_ORIGIN: HTTPS_ORIGIN,
      AUTH_GITHUB_CLIENT_ID: 'gh-id',
      AUTH_GITHUB_CLIENT_SECRET: 'gh-secret',
    }),
    undefined,
    {
      socialOverrides: {
        github: {
          verifyIdToken: async () => true,
          getUserInfo: async () => ({ user: fakeGithubUser, data: fakeGithubUser }),
        },
      },
    },
  );
});
afterAll(async () => {
  await api.close();
  await database.drop();
});

const client = () => new ApiClient(api, HTTPS_ORIGIN);
const githubSignIn = (c: ApiClient) =>
  c.post('/api/auth/sign-in/social', { provider: 'github', idToken: { token: 'fake' } });

describe('sign-up and sign-in', () => {
  it('signs up, sets a session, and creates the personal household', async () => {
    const c = client();
    const email = uniqueEmail('alice');
    const res = await c.signUp(email, 'Alice Example');
    expect(res.statusCode).toBe(200);

    const me = await c.get('/api/me');
    expect(me.statusCode).toBe(200);
    const body = me.json();
    expect(body.user.email).toBe(email);
    expect(body.hasPassword).toBe(true);
    expect(body.linkedProviders).toEqual([]);
    expect(body.households).toHaveLength(1);
    expect(body.households[0]).toMatchObject({
      name: "Alice's pets",
      role: 'owner',
      memberCount: 1,
    });
    expect(body.preferences.weightUnit).toBe('kg');
  });

  it('rejects a password shorter than 10 characters', async () => {
    const res = await client().signUp(uniqueEmail(), 'Short', 'short-pw');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });

  it('signs in again with the same password and is not given a second household', async () => {
    const email = uniqueEmail('bob');
    await client().signUp(email, 'Bob Example');
    const c = client();
    expect((await c.signIn(email)).statusCode).toBe(200);
    expect((await c.get('/api/me')).json().households).toHaveLength(1);
  });

  it('GET /api/me without a session is 401 unauthenticated', async () => {
    const res = await client().get('/api/me');
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('unauthenticated');
  });
});

describe('QA-20 a: sign-up with an email already used by a social account', () => {
  it('fails with a client error and gives the caller no session', async () => {
    const email = uniqueEmail('social');
    fakeGithubUser = { id: 'gh-a', email, name: 'Social Person', emailVerified: true };
    expect((await githubSignIn(client())).statusCode).toBe(200);

    const attacker = client();
    const res = await attacker.signUp(email, 'Attacker', 'attacker-password-1');
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect((await attacker.get('/api/me')).statusCode).toBe(401);
    // And the attacker's password does not work for that account.
    expect((await client().signIn(email, 'attacker-password-1')).statusCode).toBeGreaterThanOrEqual(
      400,
    );
  });
});

describe('QA-20 b: social sign-in never auto-links to a password account', () => {
  it('refuses to sign in as the existing password user, and links nothing', async () => {
    const email = uniqueEmail('victim');
    const owner = client();
    await owner.signUp(email, 'Victim');
    const before = (await owner.get('/api/me')).json();

    fakeGithubUser = { id: 'gh-b', email, name: 'Impostor', emailVerified: true };
    const impostor = client();
    const res = await githubSignIn(impostor);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect((await impostor.get('/api/me')).statusCode).toBe(401);

    const after = (await owner.get('/api/me')).json();
    expect(after.linkedProviders).toEqual([]);
    expect(after.user.id).toBe(before.user.id);
  });
});

describe('QA-20 c: failed password attempts are rate limited', () => {
  it('returns 429 on the 6th failed attempt within a minute', async () => {
    const email = uniqueEmail('limited');
    await client().signUp(email, 'Limited');
    const attacker = client();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++)
      statuses.push((await attacker.signIn(email, 'wrong-password-1')).statusCode);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});

describe('QA-20 d: session cookie flags', () => {
  it('is HttpOnly, Secure and SameSite=Lax', async () => {
    const res = await client().signUp(uniqueEmail('cookie'), 'Cookie Person');
    const cookies = [res.headers['set-cookie']].flat().filter(Boolean) as string[];
    const session = cookies.find((c) => c.includes('session_token'));
    expect(session).toBeDefined();
    expect(session).toMatch(/HttpOnly/i);
    expect(session).toMatch(/Secure/i);
    expect(session).toMatch(/SameSite=Lax/i);
    expect(session).toMatch(/__Secure-/);
  });
});

describe('QA-20 e: cross-origin writes are refused', () => {
  it('POST /api/me/preferences from another origin is 403 badOrigin', async () => {
    const c = client();
    await c.signUp(uniqueEmail('origin'), 'Origin Person');
    const res = await c.request(
      'PUT',
      '/api/me/preferences',
      {},
      { origin: 'https://evil.example' },
    );
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('badOrigin');
  });

  it('Better Auth refuses a cross-origin write that carries a session cookie', async () => {
    const c = client();
    await c.signUp(uniqueEmail('csrf'), 'Csrf Person');
    const res = await c.post('/api/auth/sign-out', {}, { origin: 'https://evil.example' });
    expect(res.statusCode).toBe(403);
    expect((await c.get('/api/me')).statusCode).toBe(200); // still signed in
  });
});
