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
}

export interface HouseholdFiles {
  /** Deletes every stored blob of a household. */
  removeAll(householdId: string): Promise<void>;
}
