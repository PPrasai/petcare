import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/db/migrate';
import { createTestDatabase } from './support/test-db';
import type { TestDatabase } from './support/test-db';

// CON-petcare-002 I-11: Drizzle migrations produce a schema equivalent to schema.sql.
const schemaSql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../../packages/contracts/schema.sql'),
  'utf8',
);
/** Tables that migrations create but schema.sql does not (owned by libraries). */
const LIBRARY_TABLES = new Set(['user', 'session', 'account', 'verification', 'rate_limit']);

let fromSql: TestDatabase;
let fromMigrations: TestDatabase;

beforeAll(async () => {
  fromSql = await createTestDatabase();
  fromMigrations = await createTestDatabase();
  const sqlClient = new pg.Client({ connectionString: fromSql.url });
  await sqlClient.connect();
  await sqlClient.query(schemaSql);
  await sqlClient.end();
  const pool = new pg.Pool({ connectionString: fromMigrations.url });
  await runMigrations(pool);
  await pool.end();
});
afterAll(async () => {
  await fromSql.drop();
  await fromMigrations.drop();
});

/** Names are generated differently by the two tools, so they are stripped before comparing. */
async function describeSchema(url: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const columns = await client.query(`
    SELECT table_name, column_name, data_type, udt_name, is_nullable,
           character_maximum_length, numeric_precision, numeric_scale,
           regexp_replace(coalesce(column_default, ''), '\\s+', ' ', 'g') AS column_default
    FROM information_schema.columns WHERE table_schema = 'public'
    ORDER BY table_name, column_name`);
  const indexes = await client.query(`
    SELECT tablename AS table_name,
           regexp_replace(indexdef, 'INDEX \\S+ ON', 'INDEX ON') AS definition
    FROM pg_indexes WHERE schemaname = 'public'
    ORDER BY tablename, definition`);
  const constraints = await client.query(`
    SELECT c.relname AS table_name, con.contype AS type,
           pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND con.contype IN ('p', 'u', 'c', 'f')
    ORDER BY c.relname, con.contype, pg_get_constraintdef(con.oid)`);
  await client.end();
  const keep = <T extends { table_name: string }>(rows: T[]) =>
    rows.filter((r) => !LIBRARY_TABLES.has(r.table_name));
  return {
    columns: keep(columns.rows),
    indexes: keep(indexes.rows),
    constraints: keep(constraints.rows),
  };
}

describe('migrations match schema.sql (I-11)', () => {
  it('has the same tables and columns (type, nullability, defaults)', async () => {
    const [a, b] = await Promise.all([
      describeSchema(fromSql.url),
      describeSchema(fromMigrations.url),
    ]);
    expect(b.columns).toEqual(a.columns);
  });

  it('has the same indexes', async () => {
    const [a, b] = await Promise.all([
      describeSchema(fromSql.url),
      describeSchema(fromMigrations.url),
    ]);
    expect(b.indexes).toEqual(a.indexes);
  });

  it('has the same primary keys, unique, check and foreign-key constraints', async () => {
    const [a, b] = await Promise.all([
      describeSchema(fromSql.url),
      describeSchema(fromMigrations.url),
    ]);
    expect(b.constraints).toEqual(a.constraints);
  });

  it('creates 29 tables from schema.sql', async () => {
    const a = await describeSchema(fromSql.url);
    expect(new Set(a.columns.map((c) => c.table_name)).size).toBe(29);
  });
});
