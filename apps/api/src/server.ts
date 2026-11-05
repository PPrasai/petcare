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
import { registerSyncRoutes } from './http/sync-routes';
import { registerCalendarRoutes } from './http/calendar-routes';
import { registerEmergencyRoutes } from './http/emergency-routes';
import { registerFileRoutes } from './http/file-routes';
import { registerPushRoutes } from './http/push-routes';
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
import { createPushSender } from './infra/push-sender';
import { createRateLimitStore } from './infra/rate-limit-store';
import { v7 as uuidv7 } from 'uuid';
import { createHealthRepository } from './repositories/health-repository';
import { createUnitOfWork } from './repositories';
import { createAccountService } from './services/account-service';
import { createHouseholdService } from './services/household-service';
import { createExportService } from './services/export-service';
import { createEmergencyService } from './services/emergency-service';
import { createCalendarService } from './services/calendar-service';
import type { Dispatcher } from './services/notification-dispatcher';
import { createDispatcher } from './services/notification-dispatcher';
import { createNotificationDeriver, extendSchedules } from './services/notification-derivation';
import type { PushSender } from './services/ports';
import { createFileService } from './services/file-service';
import { createPushService } from './services/push-service';
import { createInviteService } from './services/invite-service';
import { createSyncService } from './services/sync-service';
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
  /** Test seam: replaces the web push client (a fake push service). */
  pushSender?: PushSender;
  /** Test seam: the current time (a controlled clock). */
  clock?: () => Date;
  /** Test seam: lifts the 300/min per-user limit (suites that send thousands of requests). */
  relaxRateLimits?: boolean;
  /** Test seam: runs after all routes are registered, before the server is ready. */
  beforeReady?: (app: FastifyInstance) => void | Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Every registered route (method + URL template), for the route-coverage check. */
    routeList: RouteEntry[];
    /** Background work the job runner calls; tests call it directly with a controlled clock. */
    notifications: { dispatcher: Dispatcher; extend: () => Promise<number> };
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
  const metrics = createMetrics();
  const directory = createMembershipDirectory({ unitOfWork, cache });
  const fileStore = createFileStore(config.filesDir);
  const accounts = createAccountService({ unitOfWork, newId, files: fileStore, directory });
  const households = createHouseholdService({
    unitOfWork,
    directory,
    files: createFileStore(config.filesDir),
    newId,
  });
  const clock = options.clock ?? (() => new Date());
  const pushSender: PushSender =
    options.pushSender ??
    (config.vapid
      ? createPushSender(config.vapid)
      : { send: async () => ({ ok: false as const, gone: false }) });
  const dispatcher = createDispatcher({
    unitOfWork,
    sender: pushSender,
    clock,
    batch: config.dispatchBatch,
  });
  const sync = createSyncService({
    unitOfWork,
    directory,
    metrics,
    newId,
    clock,
    onRecordChanged: createNotificationDeriver({ clock, newId }),
  });
  const invites = createInviteService({
    unitOfWork,
    directory,
    limiter: createLimiter(redis, config.redisKeyPrefix),
    metrics,
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
  registerMeRoutes(
    app,
    accounts,
    createExportService({
      unitOfWork,
      files: fileStore,
      clock: options.clock ?? (() => new Date()),
    }),
  );
  registerHouseholdRoutes(app, households, invites);
  registerSyncRoutes(app, sync);
  await registerFileRoutes(
    app,
    createFileService({
      unitOfWork,
      directory,
      files: createFileStore(config.filesDir),
      newId,
      quotaBytes: config.householdQuotaBytes,
    }),
    { maxFileBytes: config.maxFileBytes },
  );
  const limiter = createLimiter(redis, config.redisKeyPrefix);
  registerPushRoutes(app, createPushService({ unitOfWork, dispatcher, limiter, newId }));
  registerCalendarRoutes(
    app,
    createCalendarService({ unitOfWork, cache, limiter, clock, appOrigin: config.appOrigin }),
  );
  registerEmergencyRoutes(
    app,
    createEmergencyService({
      unitOfWork,
      directory,
      files: createFileStore(config.filesDir),
      clock,
      appOrigin: config.appOrigin,
    }),
  );
  app.decorate('notifications', {
    dispatcher,
    extend: () => extendSchedules(unitOfWork, { clock, newId }),
  });

  app.addHook('onClose', async () => {
    redis.disconnect();
    await pool.end();
  });

  if (options.relaxRateLimits) app.rateLimitsRelaxed = true;
  await options.beforeReady?.(app);
  await app.ready();
  return app;
}
export { loadConfig } from './config/env';
export type { Config } from './config/env';
export { registerRecordTable } from './repositories/sync-registry';
