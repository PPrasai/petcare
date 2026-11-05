import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { scrubSecrets } from '../src/http/telemetry-routes';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';
import { createTestDatabase } from './support/test-db';
import type { TestDatabase } from './support/test-db';

/** The browser trace relay: size and rate limits, tagging, scrubbing, and a dead collector. */
interface Received {
  url: string;
  contentType: string;
  body: string;
}
const received: Received[] = [];
let collector: Server;
let collectorUrl = '';
let database: TestDatabase;
let api: TestApp;
let deadApi: TestApp;

const TOKEN = 'A'.repeat(43);
const batch = (extra: Record<string, unknown> = {}) => ({
  resourceSpans: [
    {
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'petcare-web' } },
          { key: 'telemetry.source', value: { stringValue: 'spoofed' } },
        ],
      },
      scopeSpans: [
        {
          spans: [
            {
              name: 'documentLoad',
              attributes: [{ key: 'http.url', value: { stringValue: `http://x/e/${TOKEN}` } }],
              ...extra,
            },
          ],
        },
      ],
    },
  ],
});
const post = (app: TestApp, payload: string | Buffer, type: string, ip: string) =>
  app.app.inject({
    method: 'POST',
    url: '/api/telemetry/v1/traces',
    remoteAddress: '127.0.0.1',
    headers: { 'content-type': type, 'x-forwarded-for': ip },
    payload,
  });

beforeAll(async () => {
  collector = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      received.push({
        url: req.url ?? '',
        contentType: String(req.headers['content-type']),
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.statusCode = 200;
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => collector.listen(0, '127.0.0.1', resolve));
  const address = collector.address();
  collectorUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

  database = await createTestDatabase();
  const base = { DATABASE_URL: database.url, REDIS_URL: inject('redisUrl') };
  api = await createTestApp(
    testConfig({ ...base, OTEL_SDK_DISABLED: 'false', OTEL_EXPORTER_OTLP_ENDPOINT: collectorUrl }),
  );
  deadApi = await createTestApp(
    testConfig({
      ...base,
      OTEL_SDK_DISABLED: 'false',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://127.0.0.1:1',
    }),
  );
});
afterAll(async () => {
  await api.close();
  await deadApi.close();
  await database.drop();
  await new Promise((resolve) => collector.close(resolve));
});

describe('scrubSecrets', () => {
  it('hides link tokens in paths', () => {
    expect(scrubSecrets(`/e/${TOKEN}`)).toBe('/e/:token');
    expect(scrubSecrets(`/cal/${TOKEN}.ics`)).toBe('/cal/:token');
    expect(scrubSecrets(`/api/public/emergency/${TOKEN}?x=1`)).toBe(
      '/api/public/emergency/:token?x=1',
    );
    expect(scrubSecrets('/e/short')).toBe('/e/short');
  });
});

describe('POST /api/telemetry/v1/traces', () => {
  it('accepts a batch without a session, tags it as browser and scrubs secret paths', async () => {
    const before = received.length;
    const res = await post(api, JSON.stringify(batch()), 'application/json', '203.0.113.1');
    expect(res.statusCode).toBe(202);
    expect(received).toHaveLength(before + 1);
    const forwarded = received[before] as Received;
    expect(forwarded.url).toBe('/v1/traces');
    expect(forwarded.contentType).toBe('application/json');
    const attributes = JSON.parse(forwarded.body).resourceSpans[0].resource.attributes;
    expect(attributes.filter((a: { key: string }) => a.key === 'telemetry.source')).toEqual([
      { key: 'telemetry.source', value: { stringValue: 'browser' } },
    ]);
    expect(forwarded.body).not.toContain(TOKEN);
    expect(forwarded.body).toContain('/e/:token');
  });

  it('forwards a protobuf batch unchanged', async () => {
    const before = received.length;
    const bytes = Buffer.from([0x0a, 0x00]);
    const res = await post(api, bytes, 'application/x-protobuf', '203.0.113.2');
    expect(res.statusCode).toBe(202);
    expect(received[before]?.contentType).toBe('application/x-protobuf');
  });

  it('drops a body that is not an OTLP batch, still answering 202', async () => {
    const before = received.length;
    const res = await post(
      api,
      JSON.stringify({ hello: 'world' }),
      'application/json',
      '203.0.113.3',
    );
    expect(res.statusCode).toBe(202);
    expect(received).toHaveLength(before);
  });

  it('answers 202 when the collector is down', async () => {
    const res = await post(deadApi, JSON.stringify(batch()), 'application/json', '203.0.113.4');
    expect(res.statusCode).toBe(202);
  });

  it('rejects a body over 256 KB with 413', async () => {
    const big = JSON.stringify(batch({ pad: 'x'.repeat(270_000) }));
    const res = await post(api, big, 'application/json', '203.0.113.5');
    expect(res.statusCode).toBe(413);
    expect(res.json().code).toBe('tooLarge');
  });

  it('allows 30 requests a minute per client, then 429', async () => {
    const ip = '203.0.113.6';
    const body = JSON.stringify({});
    for (let n = 0; n < 30; n++) {
      expect((await post(api, body, 'application/json', ip)).statusCode).toBe(202);
    }
    expect((await post(api, body, 'application/json', ip)).statusCode).toBe(429);
    expect((await post(api, body, 'application/json', '203.0.113.7')).statusCode).toBe(202);
  });

  it('names spans from a browser that sent no service name', async () => {
    const before = received.length;
    const payload = { resourceSpans: [{ resource: { attributes: [] }, scopeSpans: [] }] };
    await post(api, JSON.stringify(payload), 'application/json', '203.0.113.9');
    const attributes = JSON.parse(received[before]?.body ?? '{}').resourceSpans[0].resource
      .attributes;
    expect(attributes).toContainEqual({
      key: 'service.name',
      value: { stringValue: 'petcare-web' },
    });
  });

  it('is not subject to the origin rule', async () => {
    const res = await post(api, JSON.stringify(batch()), 'application/json', '203.0.113.8');
    expect(res.statusCode).toBe(202);
  });
});
