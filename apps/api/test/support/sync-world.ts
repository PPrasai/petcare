import { afterAll, beforeAll } from 'vitest';
import { inject } from 'vitest';
import { createTestApp } from './test-app';
import type { TestApp } from './test-app';
import { testConfig } from './test-config';
import { createTestDatabase, insertFileRow, sql } from './test-db';
import type { TestDatabase } from './test-db';
import { createPeople, shareHousehold } from './world';
import type { People } from './world';
import { createPrerequisites } from './record-fixtures';
import type { Refs } from './record-fixtures';

export interface SyncWorld {
  api: () => TestApp;
  database: () => TestDatabase;
  people: () => People;
  /** A new shared household (owner, caretaker, viewer) with prerequisite records. */
  household: () => Promise<{ householdId: string; refs: Refs }>;
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;
}

/** Registers the beforeAll/afterAll that build a real API, database and four people. */
export function useSyncWorld(): SyncWorld {
  let database: TestDatabase;
  let api: TestApp;
  let people: People;

  beforeAll(async () => {
    database = await createTestDatabase();
    api = await createTestApp(
      testConfig({ DATABASE_URL: database.url, REDIS_URL: inject('redisUrl') }),
      undefined,
      { relaxRateLimits: true },
    );
    people = await createPeople(api);
  });
  afterAll(async () => {
    await api.close();
    await database.drop();
  });

  return {
    api: () => api,
    database: () => database,
    people: () => people,
    query: (text, params) => sql(database.url, text, params),
    async household() {
      const { householdId } = await shareHousehold(people, { api, databaseUrl: database.url });
      const refs = await createPrerequisites(
        people.owner.client,
        people.owner.userId,
        householdId,
        (hid, fileId) => insertFileRow(database.url, hid, fileId),
      );
      return { householdId, refs };
    },
  };
}
