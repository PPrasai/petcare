import { v7 as uuidv7 } from 'uuid';
import type { ApiClient } from './api-client';

export const uid = (): string => uuidv7();

export interface TestMutation {
  mutationId: string;
  type: string;
  id: string;
  householdId: string;
  op: 'create' | 'update' | 'delete';
  baseVersion: number;
  fields: Record<string, unknown>;
  clientTime: string;
}

export interface TestResult {
  mutationId: string;
  status: 'applied' | 'merged' | 'rejected';
  record?: {
    id: string;
    type: string;
    householdId: string;
    version: number;
    createdBy: string;
    updatedBy: string;
    deletedAt: string | null;
    data: Record<string, unknown>;
  };
  conflictIds?: string[];
  error?: { code: string; message: string; path?: string };
}

export function mutation(
  householdId: string,
  type: string,
  op: TestMutation['op'],
  fields: Record<string, unknown>,
  options: { id?: string; baseVersion?: number; mutationId?: string } = {},
): TestMutation {
  return {
    mutationId: options.mutationId ?? uid(),
    type,
    id: options.id ?? uid(),
    householdId,
    op,
    baseVersion: options.baseVersion ?? 0,
    fields,
    clientTime: new Date().toISOString(),
  };
}

export async function push(client: ApiClient, mutations: TestMutation[]): Promise<TestResult[]> {
  const res = await client.post('/api/sync/push', { clientId: uid(), mutations });
  if (res.statusCode !== 200) throw new Error(`push failed ${res.statusCode}: ${res.body}`);
  return res.json().results as TestResult[];
}

export async function pushOne(client: ApiClient, m: TestMutation): Promise<TestResult> {
  const [result] = await push(client, [m]);
  if (!result) throw new Error('push returned no result');
  return result;
}

export async function pull(client: ApiClient, cursor?: string, limit?: number) {
  const params = new URLSearchParams();
  if (cursor) params.set('cursor', cursor);
  if (limit !== undefined) params.set('limit', String(limit));
  const res = await client.get(`/api/sync/pull?${params.toString()}`);
  return { status: res.statusCode, body: res.json(), response: res };
}

/** Pulls every page from a cursor, returning all changes and the final cursor. */
export async function pullAll(client: ApiClient, from?: string) {
  let cursor = from;
  const changes: TestResult['record'][] = [];
  for (;;) {
    const { body } = await pull(client, cursor, 500);
    changes.push(...body.changes);
    cursor = body.cursor;
    if (!body.hasMore) return { changes, cursor: cursor as string, last: body };
  }
}

export const pet = (name = 'Momo') => ({ name, species: 'dog' });
