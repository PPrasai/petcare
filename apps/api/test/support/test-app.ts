import type { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';
import { Writable } from 'node:stream';
import { buildServer } from '../../src/server';
import type { BuildServerOptions } from '../../src/server';
import type { Config } from '../../src/config/env';
import { checkResponse, responseFailures } from './response-validator';

export interface TestApp {
  app: FastifyInstance;
  config: Config;
  /** Forget a user's cached memberships (after a test changes them directly in the database). */
  forgetMemberships: (...userIds: string[]) => Promise<void>;
  /** Everything the API logged, as text (for the redaction tests). */
  logs: () => string;
  close: () => Promise<void>;
}

/**
 * Builds the real API and validates every response against openapi.yaml (QA-10).
 * A mismatch is recorded in `responseFailures`; test/setup.ts fails the test after it ends.
 */
export async function createTestApp(
  config: Config,
  logLevel?: string,
  options: {
    extraRoutes?: (app: FastifyInstance) => void;
    socialOverrides?: BuildServerOptions['socialOverrides'];
    relaxRateLimits?: boolean;
    pushSender?: BuildServerOptions['pushSender'];
    clock?: BuildServerOptions['clock'];
  } = {},
): Promise<TestApp> {
  const chunks: string[] = [];
  const logStream = new Writable({
    write(chunk, _enc, done) {
      chunks.push(String(chunk));
      done();
    },
  });
  const app = await buildServer({
    config: logLevel ? { ...config, logLevel } : config,
    logStream,
    ...(options.socialOverrides ? { socialOverrides: options.socialOverrides } : {}),
    ...(options.relaxRateLimits ? { relaxRateLimits: true } : {}),
    ...(options.pushSender ? { pushSender: options.pushSender } : {}),
    ...(options.clock ? { clock: options.clock } : {}),
    beforeReady(instance) {
      options.extraRoutes?.(instance);
      instance.addHook('onSend', async (request, reply, payload) => {
        const route = request.routeOptions.url;
        // Unmatched routes and test-only routes (/__test) are not in the contract.
        if (!route || route.startsWith('/__test')) return payload;
        const contentType = String(reply.getHeader('content-type') ?? '');
        let body: unknown = payload;
        if (typeof payload === 'string' && contentType.includes('json')) {
          body = JSON.parse(payload);
        }
        const problem = checkResponse({
          method: request.method,
          routeUrl: route,
          status: reply.statusCode,
          contentType,
          body,
        });
        if (problem) responseFailures.push(problem);
        return payload;
      });
    },
  });
  let redis: Redis | undefined;
  return {
    app,
    config,
    logs: () => chunks.join(''),
    async forgetMemberships(...userIds) {
      redis ??= new Redis(config.redisUrl, { maxRetriesPerRequest: 1 });
      await redis.del(...userIds.map((id) => `${config.redisKeyPrefix}mem:${id}`));
    },
    async close() {
      redis?.disconnect();
      await app.close();
    },
  };
}
