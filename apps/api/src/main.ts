import { existsSync } from 'node:fs';
import { loadConfig } from './config/env';
import { startTelemetry } from './infra/telemetry';

// Load .env when present (development). In production the environment is already set.
if (existsSync('.env')) process.loadEnvFile('.env');

const config = loadConfig();
const stopTelemetry = startTelemetry(config);

// Import after telemetry starts so http, pg and ioredis are instrumented.
const { buildServer } = await import('./server');
const app = await buildServer({ config });

const jobs = config.runJobs
  ? await (
      await import('./jobs')
    ).startJobs(config, app.notifications, (error) =>
      app.log.error({ err: error }, 'job runner error'),
    )
  : null;

async function shutdown(): Promise<void> {
  // Stop accepting requests, drain for up to 10 s, then close pools (AS section 6).
  const timer = setTimeout(() => process.exit(1), 10_000);
  await jobs?.stop();
  await app.close();
  await stopTelemetry();
  clearTimeout(timer);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

await app.listen({
  port: config.port,
  host: config.nodeEnv === 'production' ? '127.0.0.1' : '0.0.0.0',
});
