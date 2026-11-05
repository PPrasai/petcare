import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import type { TestProject } from 'vitest/node';

/**
 * Starts one real Postgres 17 and one real Redis 7 for the whole run (SPEC section 1.5).
 * Each test file makes its own database inside this server, so files can run in parallel.
 */
let postgres: StartedPostgreSqlContainer | undefined;
let redis: StartedTestContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  postgres = await new PostgreSqlContainer('postgres:17-alpine').start();
  redis = await new GenericContainer('redis:7-alpine')
    .withCommand(['redis-server', '--save', '', '--appendonly', 'no'])
    .withExposedPorts(6379)
    .start();
  project.provide('adminDatabaseUrl', postgres.getConnectionUri());
  project.provide('redisUrl', `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`);
}

export async function teardown(): Promise<void> {
  await redis?.stop();
  await postgres?.stop();
}

declare module 'vitest' {
  interface ProvidedContext {
    adminDatabaseUrl: string;
    redisUrl: string;
  }
}
