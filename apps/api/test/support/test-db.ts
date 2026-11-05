import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inject } from 'vitest';

export interface TestDatabase {
  url: string;
  drop: () => Promise<void>;
}

/** A fresh empty database on the shared test Postgres. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const admin = new pg.Client({ connectionString: inject('adminDatabaseUrl') });
  await admin.connect();
  const name = `t_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = new URL(inject('adminDatabaseUrl'));
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    async drop() {
      const client = new pg.Client({ connectionString: inject('adminDatabaseUrl') });
      await client.connect();
      await client.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await client.end();
    },
  };
}

/** Runs one query against a test database, closing the connection afterwards. */
export async function sql<T = Record<string, unknown>>(
  url: string,
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query(query, params);
    return rows as T[];
  } finally {
    await client.end();
  }
}

/** Inserts a stored-file row so records can reference it (the upload API arrives in slice 12). */
export async function insertFileRow(
  url: string,
  householdId: string,
  fileId: string,
): Promise<void> {
  await sql(
    url,
    `INSERT INTO file_objects (id, household_id, mime_type, size_bytes, sha256, created_by)
     VALUES ($1, $2, 'image/png', 100, decode('00', 'hex'), 'test')`,
    [fileId, householdId],
  );
}
