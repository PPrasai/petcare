import type { Redis } from 'ioredis';
import type { Limiter } from '../services/ports';

interface LocalEntry {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window counters in Redis. If Redis fails, this process counts in memory instead, so
 * limits still hold on a single node (AS section 6, QA-11).
 */
export function createLimiter(client: Redis, keyPrefix: string): Limiter {
  const local = new Map<string, LocalEntry>();

  function hitLocal(key: string, windowSeconds: number) {
    const now = Date.now();
    const entry = local.get(key);
    if (!entry || entry.resetAt <= now) {
      local.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return { count: 1, retryAfterSeconds: windowSeconds };
    }
    entry.count += 1;
    return { count: entry.count, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }

  return {
    async hit(key, windowSeconds) {
      const redisKey = `${keyPrefix}limit:${key}`;
      try {
        const replies = await client.multi().incr(redisKey).pttl(redisKey).exec();
        const count = Number(replies?.[0]?.[1]);
        let ttlMs = Number(replies?.[1]?.[1]);
        if (!Number.isFinite(count)) throw new Error('bad redis reply');
        if (ttlMs < 0) {
          await client.pexpire(redisKey, windowSeconds * 1000);
          ttlMs = windowSeconds * 1000;
        }
        return { count, retryAfterSeconds: Math.ceil(ttlMs / 1000) };
      } catch {
        return hitLocal(key, windowSeconds);
      }
    },
  };
}
