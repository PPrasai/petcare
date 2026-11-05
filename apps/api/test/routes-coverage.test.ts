import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { PENDING_OPERATIONS } from './support/pending-operations';
import { toOpenApiPath } from './support/response-validator';
import { createTestApp } from './support/test-app';
import type { TestApp } from './support/test-app';
import { testConfig } from './support/test-config';

// CON-petcare-001 I-03: operationIds and routes match one to one.
const file = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/contracts/openapi.yaml',
);
const doc = parse(readFileSync(file, 'utf8')) as {
  paths: Record<string, Record<string, { operationId?: string }>>;
};
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const operations = Object.entries(doc.paths).flatMap(([path, item]) =>
  METHODS.filter((m) => item[m]).map((m) => ({
    key: `${m.toUpperCase()} ${path}`,
    operationId: item[m]?.operationId ?? '',
  })),
);

let api: TestApp;
beforeAll(async () => {
  api = await createTestApp(testConfig({ RUN_MIGRATIONS: 'false' }));
});
afterAll(async () => {
  await api.close();
});

describe('route coverage (I-03)', () => {
  it('every operation has a unique operationId', () => {
    const ids = operations.map((o) => o.operationId);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(operations).toHaveLength(51);
  });

  it('every route under /api and /cal is an operation in openapi.yaml', () => {
    const known = new Set(operations.map((o) => o.key));
    const unknown = api.app.routeList
      .filter((r) => r.url.startsWith('/api') || r.url.startsWith('/cal'))
      .map((r) => `${r.method} ${toOpenApiPath(r.url)}`)
      .filter((key) => !known.has(key));
    expect(unknown).toEqual([]);
  });

  it('every operation that is not pending has a route, and pending ones do not', () => {
    const routed = new Set(api.app.routeList.map((r) => `${r.method} ${toOpenApiPath(r.url)}`));
    const pending = new Set(PENDING_OPERATIONS);
    const missing = operations.filter((o) => !pending.has(o.operationId) && !routed.has(o.key));
    const stale = operations.filter((o) => pending.has(o.operationId) && routed.has(o.key));
    expect(missing.map((o) => o.operationId)).toEqual([]);
    expect(stale.map((o) => o.operationId)).toEqual([]);
  });

  it('only lists real operationIds as pending', () => {
    const ids = new Set(operations.map((o) => o.operationId));
    expect(PENDING_OPERATIONS.filter((id) => !ids.has(id))).toEqual([]);
  });
});
