import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { mutation, push } from './support/sync-helpers';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { sql } from './support/test-db';
import { createPeople, shareHousehold } from './support/world';

/**
 * QA-18: a pg_dump of a seeded database restores into an empty one, with the same row counts
 * and the same checksum over the record tables. Runs the real pg_dump and pg_restore inside a
 * Postgres 17 container (the version the deployment uses).
 */
let container: StartedPostgreSqlContainer;
let api: TestApp;
let source: string;
let restored: string;

const urlFor = (name: string) => {
  const url = new URL(container.getConnectionUri());
  url.pathname = `/${name}`;
  return url.toString();
};

async function exec(command: string[]): Promise<void> {
  const result = await container.exec(command);
  if (result.exitCode !== 0) {
    throw new Error(`${command[0]} failed (${result.exitCode}): ${result.output}`);
  }
}

/** Row count of every table in the public and pgboss schemas, keyed by schema.table. */
async function rowCounts(url: string): Promise<Record<string, number>> {
  const tables = await sql<{ schemaname: string; tablename: string }>(
    url,
    `SELECT schemaname, tablename FROM pg_tables
      WHERE schemaname IN ('public', 'drizzle') ORDER BY 1, 2`,
  );
  const counts: Record<string, number> = {};
  for (const { schemaname, tablename } of tables) {
    const [row] = await sql<{ n: string }>(
      url,
      `SELECT count(*) AS n FROM "${schemaname}"."${tablename}"`,
    );
    counts[`${schemaname}.${tablename}`] = Number(row?.n);
  }
  return counts;
}

/** An order-independent checksum of every row in the tables that hold records. */
async function recordsChecksum(url: string): Promise<string> {
  const tables = await sql<{ tablename: string }>(
    url,
    `SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> ALL ($1) ORDER BY 1`,
    [['user', 'session', 'account', 'verification']],
  );
  const parts: string[] = [];
  for (const { tablename } of tables) {
    const [row] = await sql<{ digest: string }>(
      url,
      `SELECT md5(coalesce(string_agg(md5(t::text), '' ORDER BY md5(t::text)), '')) AS digest
         FROM "${tablename}" t`,
    );
    parts.push(`${tablename}:${row?.digest}`);
  }
  return parts.join(',');
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const admin = container.getConnectionUri();
  await sql(admin, 'CREATE DATABASE source_db');
  await sql(admin, 'CREATE DATABASE restored_db');
  source = urlFor('source_db');
  restored = urlFor('restored_db');

  api = await createTestApp(
    testConfig({ DATABASE_URL: source, REDIS_URL: inject('redisUrl') }),
    undefined,
    { relaxRateLimits: true },
  );
  const people = await createPeople(api);
  const { householdId } = await shareHousehold(people, { api, databaseUrl: source });
  const pet = mutation(householdId, 'pet', 'create', { name: 'Momo', species: 'dog' });
  await push(people.owner.client, [
    pet,
    mutation(householdId, 'vaccination', 'create', {
      petId: pet.id,
      vaccineName: 'Rabies',
      givenOn: '2025-01-15',
    }),
    mutation(householdId, 'contact', 'create', { name: 'Dr Rao' }),
  ]);
  await push(people.owner.client, [
    mutation(householdId, 'pet', 'update', { colour: 'Brindle' }, { id: pet.id, baseVersion: 1 }),
  ]);
  await api.close();
});

afterAll(async () => {
  await container?.stop();
});

describe('backup and restore (QA-18)', () => {
  it('restores a pg_dump into an empty database with equal counts and checksum', async () => {
    const before = await rowCounts(source);
    expect(before['public.pets']).toBeGreaterThan(0);
    expect(before['public.change_log']).toBeGreaterThan(0);

    const user = container.getUsername();
    await exec(['pg_dump', '-U', user, '-Fc', '-f', '/tmp/petcare.dump', 'source_db']);
    await exec(['pg_restore', '-U', user, '-d', 'restored_db', '/tmp/petcare.dump']);

    expect(await rowCounts(restored)).toEqual(before);
    expect(await recordsChecksum(restored)).toBe(await recordsChecksum(source));
  });
});
