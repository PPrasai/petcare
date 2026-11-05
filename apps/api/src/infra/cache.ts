import { metrics } from '@opentelemetry/api';
import { Redis } from 'ioredis';
import type { Logger } from './logger';

/** Cache-aside store. Every failure is a miss: Redis is never a source of truth (QA-11). */
export interface Cache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  ping(): Promise<boolean>;
}

const requests = () =>
  metrics.getMeter('petcare-api').createCounter('petcare_cache_requests_total', {
    description: 'Cache lookups by result',
  });

/** A Redis client that fails fast and reconnects in the background. */
export function createRedisClient(url: string, logger: Logger): Redis {
  const client = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1_000,
    retryStrategy: (attempt) => Math.min(attempt * 250, 5_000),
  });
  let reported = false;
  client.on('error', (err: Error) => {
    if (!reported) logger.warn({ err: err.message }, 'redis unavailable; running without cache');
    reported = true;
  });
  client.on('ready', () => {
    reported = false;
  });
  client.connect().catch(() => undefined);
  return client;
}

export function createCache(client: Redis, keyPrefix: string): Cache {
  const counter = requests();
  const k = (key: string) => `${keyPrefix}${key}`;
  return {
    async get(key) {
      try {
        const value = await client.get(k(key));
        counter.add(1, { result: value === null ? 'miss' : 'hit' });
        return value;
      } catch {
        counter.add(1, { result: 'error' });
        return null;
      }
    },
    async set(key, value, ttlSeconds) {
      try {
        await client.set(k(key), value, 'EX', ttlSeconds);
      } catch {
        counter.add(1, { result: 'error' });
      }
    },
    async del(key) {
      try {
        await client.del(k(key));
      } catch {
        counter.add(1, { result: 'error' });
      }
    },
    async ping() {
      try {
        return (await client.ping()) === 'PONG';
      } catch {
        return false;
      }
    },
  };
}
