// Fails if a workspace package.json declares a runtime dependency outside SPEC 5.2.
import { readFileSync, globSync } from 'node:fs';

const allowed = new Set(
  `zod date-fns @date-fns/tz uuid
react react-dom @tanstack/react-router @tanstack/router-plugin @tanstack/react-query @tanstack/react-form zustand dexie dexie-react-hooks openapi-fetch
vite @vitejs/plugin-react vite-plugin-pwa workbox-window tailwindcss lucide-react recharts qrcode
@opentelemetry/api @opentelemetry/sdk-trace @opentelemetry/instrumentation-fetch @opentelemetry/instrumentation-document-load @opentelemetry/exporter-trace-otlp-http
fastify @fastify/cookie @fastify/helmet @fastify/rate-limit @fastify/multipart @fastify/static @fastify/otel
better-auth drizzle-orm drizzle-kit pg ioredis pg-boss web-push ics file-type pino pino-opentelemetry-transport
@opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node ajv ajv-formats archiver yaml
openapi-typescript @redocly/cli
@petcare/domain @petcare/contracts @petcare/api @petcare/web`.split(/\s+/),
);

const files = globSync([
  'package.json',
  'apps/*/package.json',
  'packages/*/package.json',
  'tests/*/package.json',
]);
let bad = 0;
for (const f of files) {
  const pkg = JSON.parse(readFileSync(f, 'utf8'));
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    if (!allowed.has(name)) {
      console.error(`${f}: runtime dependency "${name}" is not in SPEC 5.2 (needs a Discovery)`);
      bad++;
    }
  }
}
if (bad) process.exit(1);
console.log('runtime dependencies ok');
