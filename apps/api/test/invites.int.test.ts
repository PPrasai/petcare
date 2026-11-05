import { createHash } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ApiClient, ORIGIN, uniqueEmail } from './support/api-client';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { createTestDatabase } from './support/test-db';
import type { TestDatabase } from './support/test-db';
import { createPeople, shareHousehold } from './support/world';
import type { People } from './support/world';

// QA-23: invite brute-force resistance (ISS-AS-02), plus the invite lifecycle.
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

const CODE = /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;
const invitesUrl = (id: string) => `/api/households/${id}/invites`;

async function newHousehold() {
  const created = await people.owner.client.post('/api/households', { name: 'Invite test' });
  return created.json().id as string;
}

async function sql<T>(query: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: database.url });
  await client.connect();
  try {
    const { rows } = await client.query(query, params);
    return rows as T[];
  } finally {
    await client.end();
  }
}

async function freshUser(ip?: string) {
  const client = new ApiClient(api, ORIGIN, ip);
  await client.signUp(uniqueEmail('joiner'), 'Joiner');
  return client;
}

describe('creating invites', () => {
  it('returns a one-time link and code; the list never shows them again', async () => {
    const householdId = await newHousehold();
    const res = await people.owner.client.post(invitesUrl(householdId), { role: 'caretaker' });
    expect(res.statusCode).toBe(201);
    const invite = res.json();
    expect(invite.link).toMatch(new RegExp(`^${ORIGIN}/join#[A-Za-z0-9_-]{43}$`));
    expect(invite.code).toMatch(CODE);
    expect(invite.status).toBe('open');
    const expiresInDays =
      (Date.parse(invite.expiresAt) - Date.parse(invite.createdAt)) / 86_400_000;
    expect(expiresInDays).toBeCloseTo(7, 3);

    const list = await people.owner.client.get(invitesUrl(householdId));
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(1);
    expect(JSON.stringify(list.json())).not.toContain(invite.code);
    expect(list.body).not.toContain(invite.link.split('#')[1]);
  });

  it('stores only hashes of the token and the code', async () => {
    const householdId = await newHousehold();
    const invite = (
      await people.owner.client.post(invitesUrl(householdId), { role: 'viewer' })
    ).json();
    const token = invite.link.split('#')[1] as string;
    const rows = await sql<{ token_hash: Buffer; code_hash: Buffer }>(
      'SELECT token_hash, code_hash FROM invites WHERE id = $1',
      [invite.id],
    );
    const row = rows[0];
    expect(row?.token_hash).toHaveLength(32);
    expect(row?.code_hash).toHaveLength(32);
    // The stored value is the SHA-256 of the raw token bytes, not the token itself.
    expect(
      row?.token_hash.equals(createHash('sha256').update(Buffer.from(token, 'base64url')).digest()),
    ).toBe(true);
    expect(row?.token_hash.toString('base64url')).not.toBe(token);
    expect(
      row?.code_hash.equals(createHash('sha256').update(invite.code.replace('-', '')).digest()),
    ).toBe(true);
  });

  it('issues codes of 10 Crockford base32 characters, all different', async () => {
    const householdId = await newHousehold();
    const codes = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const res = await people.owner.client.post(invitesUrl(householdId), { role: 'viewer' });
      codes.add(res.json().code);
      expect(res.json().code).toMatch(CODE);
    }
    expect(codes.size).toBe(25);
  });

  it('only the owner manages invites; roles other than caretaker or viewer are refused', async () => {
    const { householdId } = await shareHousehold(people, world());
    expect(
      (await people.caretaker.client.post(invitesUrl(householdId), { role: 'viewer' })).statusCode,
    ).toBe(403);
    expect(
      (await people.owner.client.post(invitesUrl(householdId), { role: 'owner' })).statusCode,
    ).toBe(400);
    expect((await people.outsider.client.get(invitesUrl(householdId))).statusCode).toBe(404);
  });
});

describe('previewing and accepting', () => {
  it('previews by link token or by a sloppily typed code, without joining', async () => {
    const householdId = await newHousehold();
    const invite = (
      await people.owner.client.post(invitesUrl(householdId), { role: 'viewer' })
    ).json();
    const token = invite.link.split('#')[1] as string;
    const joiner = await freshUser();

    const byToken = await joiner.post('/api/invites/preview', { token });
    expect(byToken.statusCode).toBe(200);
    expect(byToken.json()).toMatchObject({ householdName: 'Invite test', role: 'viewer' });

    // lowercase, no hyphen, with O written for 0 and I for 1 when the real code has them
    const sloppy = (invite.code as string)
      .replace('-', '')
      .toLowerCase()
      .replaceAll('0', 'o')
      .replaceAll('1', 'i');
    const byCode = await joiner.post('/api/invites/preview', { code: sloppy });
    expect(byCode.statusCode).toBe(200);

    expect(
      (await joiner.get('/api/households')).json().map((h: { id: string }) => h.id),
    ).not.toContain(householdId);
  });

  it('accepting joins with the invited role and uses the invite up', async () => {
    const householdId = await newHousehold();
    const invite = (
      await people.owner.client.post(invitesUrl(householdId), { role: 'caretaker' })
    ).json();
    const first = await freshUser();
    const second = await freshUser();

    const joined = await first.post('/api/invites/accept', { code: invite.code });
    expect(joined.statusCode).toBe(200);
    expect(joined.json()).toMatchObject({ id: householdId, role: 'caretaker', memberCount: 2 });

    // single use: a second person cannot use the same invite, by code or by link
    expect((await second.post('/api/invites/accept', { code: invite.code })).statusCode).toBe(404);
    expect(
      (await second.post('/api/invites/accept', { token: invite.link.split('#')[1] })).statusCode,
    ).toBe(404);
    expect((await people.owner.client.get(invitesUrl(householdId))).json()).toHaveLength(0);
  });

  it('is idempotent for an existing member: role unchanged, invite stays open', async () => {
    const householdId = await newHousehold();
    const invite = (
      await people.owner.client.post(invitesUrl(householdId), { role: 'viewer' })
    ).json();
    const res = await people.owner.client.post('/api/invites/accept', { code: invite.code });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('owner');
    expect((await people.owner.client.get(invitesUrl(householdId))).json()).toHaveLength(1);
  });

  it('revoked, expired and used invites are 404, like a code that never existed', async () => {
    const householdId = await newHousehold();
    const make = async () =>
      (await people.owner.client.post(invitesUrl(householdId), { role: 'viewer' })).json();
    const joiner = await freshUser();

    const revoked = await make();
    expect(
      (await people.owner.client.request('DELETE', `${invitesUrl(householdId)}/${revoked.id}`))
        .statusCode,
    ).toBe(204);
    expect((await joiner.post('/api/invites/accept', { code: revoked.code })).statusCode).toBe(404);

    const expired = await make();
    await sql("UPDATE invites SET expires_at = now() - interval '1 minute' WHERE id = $1", [
      expired.id,
    ]);
    expect((await joiner.post('/api/invites/preview', { code: expired.code })).statusCode).toBe(
      404,
    );
    expect((await joiner.post('/api/invites/accept', { code: expired.code })).statusCode).toBe(404);

    const never = await joiner.post('/api/invites/accept', { code: '0000000000' });
    expect(never.statusCode).toBe(404);
    expect(never.json()).toEqual(
      (await joiner.post('/api/invites/accept', { code: expired.code })).json(),
    );
  });

  it('treats malformed secrets as 404 and needs a signed-in caller', async () => {
    const joiner = await freshUser();
    for (const body of [
      {},
      { code: 'short' },
      { token: 'x' },
      { code: 123 },
      { token: 'a'.repeat(43), code: 'A'.repeat(10) },
    ]) {
      expect(
        (await joiner.post('/api/invites/accept', body)).statusCode,
        JSON.stringify(body),
      ).toBe(404);
    }
    const anonymous = new ApiClient(api);
    expect((await anonymous.post('/api/invites/accept', { code: 'AAAAAAAAAA' })).statusCode).toBe(
      401,
    );
    expect((await anonymous.post('/api/invites/preview', { code: 'AAAAAAAAAA' })).statusCode).toBe(
      401,
    );
  });

  it('revoking is owner only and scoped to the household', async () => {
    const { householdId } = await shareHousehold(people, world());
    const other = await newHousehold();
    const invite = (
      await people.owner.client.post(invitesUrl(householdId), { role: 'viewer' })
    ).json();
    expect(
      (await people.caretaker.client.request('DELETE', `${invitesUrl(householdId)}/${invite.id}`))
        .statusCode,
    ).toBe(403);
    expect(
      (await people.owner.client.request('DELETE', `${invitesUrl(other)}/${invite.id}`)).statusCode,
    ).toBe(404);
  });
});

describe('QA-23: attempt limits', () => {
  it('the 11th attempt in an hour by one user is 429 with Retry-After', async () => {
    const attacker = await freshUser();
    for (let i = 1; i <= 10; i++) {
      const guess =
        i % 2 === 0
          ? attacker.post('/api/invites/accept', { code: `ZZZZZ${i}ZZZZZ`.slice(0, 10) })
          : attacker.post('/api/invites/preview', { code: 'ABCDE23456' });
      expect((await guess).statusCode).toBe(404);
    }
    const blocked = await attacker.post('/api/invites/accept', { code: 'ABCDE23456' });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().code).toBe('rateLimited');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(3600);
  });

  it('a valid invite does not get through once the user is over the limit', async () => {
    const householdId = await newHousehold();
    const invite = (
      await people.owner.client.post(invitesUrl(householdId), { role: 'viewer' })
    ).json();
    const attacker = await freshUser();
    for (let i = 0; i < 10; i++)
      await attacker.post('/api/invites/preview', { code: 'ABCDE23456' });
    expect((await attacker.post('/api/invites/accept', { code: invite.code })).statusCode).toBe(
      429,
    );
  });

  it('the 31st attempt from one IP is 429 even across different users', async () => {
    const ip = '203.0.113.99';
    const users = await Promise.all([freshUser(ip), freshUser(ip), freshUser(ip), freshUser(ip)]);
    let blockedAt = 0;
    let attempt = 0;
    outer: for (const user of users) {
      for (let i = 0; i < 8; i++) {
        attempt++;
        const res = await user.post('/api/invites/preview', { code: 'ABCDE23456' });
        if (res.statusCode === 429) {
          blockedAt = attempt;
          break outer;
        }
      }
    }
    expect(blockedAt).toBe(31);
  });

  it('counts failures in the shared bucket across preview and accept', async () => {
    const attacker = await freshUser();
    for (let i = 0; i < 5; i++) await attacker.post('/api/invites/preview', { code: 'ABCDE23456' });
    for (let i = 0; i < 5; i++) await attacker.post('/api/invites/accept', { code: 'ABCDE23456' });
    expect((await attacker.post('/api/invites/preview', { code: 'ABCDE23456' })).statusCode).toBe(
      429,
    );
  });
});
