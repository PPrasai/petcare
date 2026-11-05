import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    /** Test seam: lifts the per-user limit so suites that send thousands of requests can run. */
    rateLimitsRelaxed: boolean;
  }
}

interface Options {
  /** A store class from createRateLimitStore, or undefined for the in-memory default. */
  store?: unknown;
}

/**
 * Per-route limit for every authenticated /api route: 300 requests per minute per user
 * (CON-petcare-001 section 2.1, last row). Add it as `config: { rateLimit: AUTHENTICATED_LIMIT }`.
 * Routes with their own row in the table use their own values. Public routes without a row
 * (health, ready, config) have no limit.
 */
export const AUTHENTICATED_LIMIT = {
  max: (request: FastifyRequest) => (request.server.rateLimitsRelaxed ? 1_000_000 : 300),
  timeWindow: '1 minute',
} as const;

export async function registerRateLimiting(app: FastifyInstance, options: Options): Promise<void> {
  app.decorate('rateLimitsRelaxed', false);
  await app.register(rateLimit, {
    global: false,
    // The signed-in user when there is one (resolved by registerActorResolution), else the client IP.
    keyGenerator: (request) => request.actor?.userId ?? request.ip,
    ...(options.store ? { store: options.store as never } : {}),
    errorResponseBuilder: () => {
      const error = new Error('rate limit exceeded') as Error & { statusCode: number };
      error.statusCode = 429;
      return error;
    },
  });
}
