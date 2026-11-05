// Starts Postgres, Redis and the real API for the e2e run, and keeps them up until killed.
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer } from 'testcontainers';
import { buildServer, loadConfig } from '../../apps/api/src/server';

const postgres = await new PostgreSqlContainer('postgres:17-alpine').start();
const redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();

const app = await buildServer({
  config: loadConfig({
    NODE_ENV: 'test',
    APP_ORIGIN: 'http://localhost:4173',
    BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-123',
    OTEL_SDK_DISABLED: 'true',
    LOG_LEVEL: 'warn',
    RUN_JOBS: 'false',
    PORT: '3100',
    DATABASE_URL: postgres.getConnectionUri(),
    REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`,
  }),
  relaxRateLimits: true,
});
await app.listen({ port: 3100, host: '127.0.0.1' });
console.log('e2e API ready on 3100');

const stop = async () => {
  await app.close();
  await redis.stop();
  await postgres.stop();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
