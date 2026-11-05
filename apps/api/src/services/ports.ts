/** What services need from infrastructure. The real adapters live in src/infra. */

export interface KeyValueCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

/** Counts events per key in a time window (Redis, falling back to process memory). */
export interface Limiter {
  hit(key: string, windowSeconds: number): Promise<{ count: number; retryAfterSeconds: number }>;
}

export interface Metrics {
  inviteAttempt(result: 'ok' | 'notFound' | 'rateLimited'): void;
  syncMutation(status: 'applied' | 'merged' | 'rejected'): void;
  syncConflicts(recordType: string, count: number): void;
}

export interface HouseholdFiles {
  /** Deletes every stored blob of a household. */
  removeAll(householdId: string): Promise<void>;
  /** Stores a blob; the path is built from the two ids only. */
  write(householdId: string, fileId: string, bytes: Buffer): Promise<void>;
  /** Reads a blob, or null when it is missing. */
  read(householdId: string, fileId: string): Promise<Buffer | null>;
  remove(householdId: string, fileId: string): Promise<void>;
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Opens this path when the notification is clicked. */
  url: string;
  tag?: string;
}

export type PushOutcome = { ok: true } | { ok: false; gone: boolean };

/** Sends one web push message. The adapter lives in src/infra; tests supply a fake. */
export interface PushSender {
  send(target: PushTarget, payload: PushPayload): Promise<PushOutcome>;
}
