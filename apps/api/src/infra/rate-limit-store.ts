import type { Redis } from 'ioredis';

interface Counter {
  current: number;
  ttl: number;
}
type Done = (err: Error | null, result: Counter) => void;

interface LocalEntry {
  current: number;
  resetAt: number;
}

/**
 * Rate-limit counters in Redis, falling back to this process's memory when Redis fails
 * (AS section 6). Used by @fastify/rate-limit through its `store` option.
 */
export function createRateLimitStore(client: Redis, keyPrefix: string) {
  return class RedisWithMemoryFallback {
    readonly local = new Map<string, LocalEntry>();

    // @fastify/rate-limit constructs the store with its global options and calls child() per route.
    constructor(readonly options: Record<string, unknown> = {}) {}

    child(routeOptions: Record<string, unknown>) {
      return new RedisWithMemoryFallback({ ...this.options, ...routeOptions });
    }

    incr(key: string, done: Done, timeWindow: number): void {
      const info = this.options.routeInfo as { method?: string; url?: string } | undefined;
      const redisKey = `${keyPrefix}rl:${info?.method ?? ''}:${info?.url ?? ''}:${key}`;
      client
        .multi()
        .incr(redisKey)
        .pttl(redisKey)
        .exec()
        .then(async (replies) => {
          const current = Number(replies?.[0]?.[1]);
          let ttl = Number(replies?.[1]?.[1]);
          if (!Number.isFinite(current)) throw new Error('bad redis reply');
          if (ttl < 0) {
            await client.pexpire(redisKey, timeWindow);
            ttl = timeWindow;
          }
          done(null, { current, ttl });
        })
        .catch(() => done(null, this.incrLocal(key, timeWindow)));
    }

    incrLocal(key: string, timeWindow: number): Counter {
      const now = Date.now();
      const entry = this.local.get(key);
      if (!entry || entry.resetAt <= now) {
        this.local.set(key, { current: 1, resetAt: now + timeWindow });
        return { current: 1, ttl: timeWindow };
      }
      entry.current += 1;
      return { current: entry.current, ttl: entry.resetAt - now };
    }
  };
}
