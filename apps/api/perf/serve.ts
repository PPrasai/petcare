import { loadConfig } from '../src/config/env';
import { buildServer } from '../src/server';

/**
 * The API as the perf run sees it: the real server, with the per-IP rate limits relaxed because
 * every virtual user connects from one address. Nothing else differs from `src/main.ts`.
 * Configuration comes from the environment, as in production.
 */
const config = loadConfig();
const app = await buildServer({ config, relaxRateLimits: true });
await app.listen({ port: config.port, host: '127.0.0.1' });
console.log(`perf server listening on ${config.port}`);
process.on('SIGTERM', () => void app.close().then(() => process.exit(0)));
process.on('SIGINT', () => void app.close().then(() => process.exit(0)));
