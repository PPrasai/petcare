import type { RecordEnvelope, RecordType } from '@petcare/domain';

export type Role = 'owner' | 'caretaker' | 'viewer';

export interface PushMutation {
  mutationId: string;
  type: RecordType;
  id: string;
  householdId: string;
  op: 'create' | 'update' | 'delete';
  baseVersion: number;
  fields: Record<string, unknown>;
  clientTime: string;
}

export type RejectCode =
  | 'notFound'
  | 'forbidden'
  | 'invalid'
  | 'invalidReference'
  | 'duplicate'
  | 'deleted'
  | 'appendOnlyUpdate'
  | 'tooLarge';

export interface PushResult {
  mutationId: string;
  status: 'applied' | 'merged' | 'rejected';
  record?: RecordEnvelope;
  conflictIds?: string[];
  error?: { code: RejectCode; message: string; path?: string };
}

export interface ConflictItem {
  id: string;
  householdId: string;
  recordType: RecordType;
  recordId: string;
  field: string | null;
  keptValue: unknown;
  replacedValue: unknown;
  replacedBy: string;
  winningBy: string;
  reason: 'concurrentFieldEdit' | 'updateAfterDelete';
  createdAt: string;
  resolvedAt: string | null;
}

export interface PullPage {
  changes: RecordEnvelope[];
  households: { id: string; name: string; role: Role }[];
  conflicts: ConflictItem[];
  cursor: string;
  hasMore: boolean;
}

/** The server as the sync engine sees it (CON-petcare-001 sync operations). */
export interface RemoteApi {
  push(request: {
    clientId: string;
    mutations: PushMutation[];
  }): Promise<{ results: PushResult[]; serverTime: string }>;
  pull(cursor: string | undefined, limit?: number): Promise<PullPage>;
}

/** The request could not be completed: offline, timeout, or a 5xx the engine retries. */
export class NetworkError extends Error {
  constructor(message = 'network unavailable') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** A 4xx the engine cannot fix by retrying. `code` is the problem+json code. */
export class RemoteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}

export const isCursorExpired = (e: unknown): boolean =>
  e instanceof RemoteError && e.status === 410 && e.code === 'cursorExpired';
