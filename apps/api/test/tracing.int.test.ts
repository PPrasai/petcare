import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { SpanProcessor } from '../src/infra/telemetry';

/**
 * QA-08: one trace id across the tiers. A browser sends a W3C traceparent; the API's route span
 * and its Postgres span join that trace, and the request log line carries the same trace_id.
 * The SDK must start before fastify, pg and ioredis load, so everything is imported dynamically.
 */
const BROWSER_TRACE = '0af7651916cd43dd8448eb211c80319c';
const BROWSER_SPAN = 'b7ad6b7169203331';
const TOKEN = 'T'.repeat(43);

type Api = Awaited<ReturnType<(typeof import('./support/test-app'))['createTestApp']>>;
let api: Api;
let stop: () => Promise<void>;
type Finished = Parameters<SpanProcessor['onEnd']>[0];
const finished: Finished[] = [];
/** Keeps every finished span in memory. */
const recorder: SpanProcessor = {
  onStart: () => undefined,
  onEnd: (span) => void finished.push(span),
  forceFlush: async () => undefined,
  shutdown: async () => undefined,
};
const exporter = { getFinishedSpans: () => finished };
let drop: () => Promise<void>;

beforeAll(async () => {
  const { testConfig } = await import('./support/test-config');
  const { startTelemetry } = await import('../src/infra/telemetry');
  const probe = testConfig({ OTEL_SDK_DISABLED: 'false' });
  stop = startTelemetry(probe, { spanProcessors: [recorder] });

  const { createTestDatabase } = await import('./support/test-db');
  const database = await createTestDatabase();
  drop = () => database.drop();
  const { createTestApp } = await import('./support/test-app');
  api = await createTestApp(
    testConfig({
      DATABASE_URL: database.url,
      REDIS_URL: inject('redisUrl'),
      OTEL_SDK_DISABLED: 'false',
    }),
    'info',
  );
});
afterAll(async () => {
  await api.close();
  await stop();
  await drop();
});

describe('tracing', () => {
  it('joins the browser trace in the API span, the Postgres span and the log line', async () => {
    const res = await api.app.inject({
      method: 'GET',
      url: '/api/ready',
      headers: { traceparent: `00-${BROWSER_TRACE}-${BROWSER_SPAN}-01` },
    });
    expect(res.statusCode).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 100));
    const spans = exporter
      .getFinishedSpans()
      .filter((s) => s.spanContext().traceId === BROWSER_TRACE);
    const names = spans.map((s) => s.name);
    expect(
      names.some((n) => n.includes('/api/ready')),
      names.join(', '),
    ).toBe(true);
    const database = spans.find(
      (s) =>
        s.attributes['db.system'] === 'postgresql' ||
        s.attributes['db.system.name'] === 'postgresql',
    );
    expect(database, `no pg span in: ${names.join(', ')}`).toBeDefined();

    const line = api
      .logs()
      .split('\n')
      .filter((l) => l.includes('"msg":"request"') && l.includes('/api/ready'))
      .map((l) => JSON.parse(l) as { trace_id?: string })
      .at(-1);
    expect(line?.trace_id).toBe(BROWSER_TRACE);
  });

  it('never records a span for a path that carries a secret token', async () => {
    await api.app.inject({ method: 'GET', url: `/cal/${TOKEN}.ics` });
    await api.app.inject({ method: 'GET', url: `/api/public/emergency/${TOKEN}` });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const dump = JSON.stringify(
      exporter.getFinishedSpans().map((s) => ({ name: s.name, attributes: s.attributes })),
    );
    expect(dump).not.toContain(TOKEN);
  });
});
