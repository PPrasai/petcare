import helmet from '@fastify/helmet';
import Fastify, { LogController } from 'fastify';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { DestinationStream } from 'pino';
import type { Config } from './config/env';
import { createDb } from './db/connection';
import { runMigrations } from './db/migrate';
import { registerActorResolution } from './http/actor';
import { registerAuthRoutes } from './http/auth-routes';
import { registerHouseholdRoutes } from './http/household-routes';
import { registerMeRoutes } from './http/me-routes';
import { registerErrorHandling } from './http/error-handler';
import { registerOriginHook } from './http/origin-hook';
import { registerRateLimiting } from './http/rate-limiting';
import { registerRequestLogging } from './http/request-logging';
import { registerSystemRoutes } from './http/system-routes';
import { createAuth } from './infra/auth';
import type { AuthDeps } from './infra/auth';
import { createCache, createRedisClient } from './infra/cache';
import { createFileStore } from './infra/file-store';
import { createLimiter } from './infra/limiter';
import { createLogger } from './infra/logger';
import { createMetrics } from './infra/metrics';
import { createRateLimitStore } from './infra/rate-limit-store';
import { v7 as uuidv7 } from 'uuid';
import { createHealthRepository } from './repositories/health-repository';
import { createUnitOfWork } from './repositories';
import { createAccountService } from './services/account-service';
import { createHouseholdService } from './services/household-service';
import { createInviteService } from './services/invite-service';
import { createMembershipDirectory } from './services/membership-directory';
import { getPublicConfig } from './services/public-config-service';
import { checkReadiness } from './services/readiness-service';

export interface RouteEntry {
  method: string;
  url: string;
}

export interface BuildServerOptions {
  config: Config;
  /** Where log lines go; defaults to stdout. Tests capture it. */
  logStream?: DestinationStream;
  /** Test seam: replaces parts of a social provider's options (a fake identity provider). */
  socialOverrides?: AuthDeps['socialOverrides'];
  /** Test seam: runs after all routes are registered, before the server is ready. */
  beforeReady?: (app: FastifyInstance) => void | Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Every registered route (method + URL template), for the route-coverage check. */
    routeList: RouteEntry[];
  }
}

/**
 * Public entry point: builds the API (composition root). Nothing listens until `app.listen`.
 * Redis being down never stops the API from starting (QA-11).
 */
export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  const { config } = options;
  const logger = createLogger(config.logLevel, options.logStream);
  const { db, pool } = createDb(config.databaseUrl);
  const redis = createRedisClient(config.redisUrl, logger);
  const cache = createCache(redis, config.redisKeyPrefix);

  if (config.runMigrations) await runMigrations(pool);

  const app = Fastify({
    // pino's Logger is a FastifyBaseLogger; the cast keeps the instance type the default one.
    loggerInstance: logger as unknown as FastifyBaseLogger,
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: config.trustProxy,
    bodyLimit: 1_048_576,
  });

  const routeList: RouteEntry[] = [];
  app.decorate('routeList', routeList);
  app.addHook('onRoute', (route) => {
    for (const method of [route.method].flat()) {
      if (method !== 'HEAD') routeList.push({ method, url: route.url });
    }
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });

  registerErrorHandling(app);
  registerOriginHook(app, config.appOrigin);
  registerRequestLogging(app);

  const unitOfWork = createUnitOfWork(db);
  const newId = () => uuidv7();
  const directory = createMembershipDirectory({ unitOfWork, cache });
  const accounts = createAccountService({ unitOfWork, newId });
  const households = createHouseholdService({
    unitOfWork,
    directory,
    files: createFileStore(config.filesDir),
    newId,
  });
  const invites = createInviteService({
    unitOfWork,
    directory,
    limiter: createLimiter(redis, config.redisKeyPrefix),
    metrics: createMetrics(),
    newId,
    clock: () => new Date(),
    appOrigin: config.appOrigin,
  });
  const auth = createAuth({
    config,
    db,
    onUserCreated: accounts.ensurePersonalHousehold,
    ...(options.socialOverrides ? { socialOverrides: options.socialOverrides } : {}),
  });
  registerActorResolution(app, auth.getUserId);
  await registerRateLimiting(app, { store: createRateLimitStore(redis, config.redisKeyPrefix) });

  const health = createHealthRepository(db);
  registerSystemRoutes(app, {
    readiness: () => checkReadiness({ pingDatabase: health.pingDatabase, pingCache: cache.ping }),
    publicConfig: () => getPublicConfig(config),
  });

  registerAuthRoutes(app, auth.handler, config.appOrigin);
  registerMeRoutes(app, accounts);
  registerHouseholdRoutes(app, households, invites);

  app.addHook('onClose', async () => {
    redis.disconnect();
    await pool.end();
  });

  await options.beforeReady?.(app);
  await app.ready();
  return app;
}
