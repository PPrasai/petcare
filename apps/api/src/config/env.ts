import { z } from 'zod';

/**
 * Environment parsing (SPEC section 5.6). The API refuses to start if any key is invalid.
 * Empty strings count as "not set", so a copy of .env.example with blanks uses the defaults.
 */

const bool = (fallback: boolean) =>
  z.preprocess((v) => (v === undefined ? String(fallback) : v), z.stringbool());
const int = (fallback: number, min = 0) => z.coerce.number().int().min(min).default(fallback);
const text = (fallback: string) => z.string().default(fallback);
const optionalText = () => z.string().optional();

function schemaFor(isProduction: boolean) {
  // Production has no defaults for connection strings and secrets.
  const required = (devDefault: string) =>
    isProduction ? z.string().min(1) : z.string().min(1).default(devDefault);
  return z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: int(isProduction ? 8002 : 3000, 1),
    APP_ORIGIN: z
      .url()
      .default('http://localhost:5173')
      .transform((s) => s.replace(/\/$/, '')),
    DATABASE_URL: required('postgres://petcare:petcare@localhost:54329/petcare'),
    REDIS_URL: required('redis://localhost:63799'),
    REDIS_KEY_PREFIX: text('pc:'),
    BETTER_AUTH_SECRET: z.string().min(32),
    SESSION_MAX_AGE_DAYS: int(30, 1),
    EMAIL_PASSWORD_ENABLED: bool(true),
    AUTH_GOOGLE_CLIENT_ID: optionalText(),
    AUTH_GOOGLE_CLIENT_SECRET: optionalText(),
    AUTH_GITHUB_CLIENT_ID: optionalText(),
    AUTH_GITHUB_CLIENT_SECRET: optionalText(),
    AUTH_MICROSOFT_CLIENT_ID: optionalText(),
    AUTH_MICROSOFT_CLIENT_SECRET: optionalText(),
    AUTH_MICROSOFT_TENANT_ID: text('common'),
    AUTH_APPLE_CLIENT_ID: optionalText(),
    AUTH_APPLE_CLIENT_SECRET: optionalText(),
    VAPID_PUBLIC_KEY: optionalText(),
    VAPID_PRIVATE_KEY: optionalText(),
    VAPID_SUBJECT: text('mailto:admin@localhost'),
    FILES_DIR: text(isProduction ? '/data/files' : './.data/files'),
    MAX_FILE_BYTES: int(10_485_760, 1),
    HOUSEHOLD_QUOTA_BYTES: int(524_288_000, 1),
    RUN_MIGRATIONS: bool(true),
    RUN_JOBS: bool(true),
    NOTIFICATION_WINDOW_DAYS: int(30, 1),
    DISPATCH_BATCH: int(200, 1),
    DISPATCH_CRON: text('* * * * *'),
    EXTEND_CRON: text('30 2 * * *'),
    PURGE_CRON: text('0 3 * * *'),
    RETENTION_DAYS: int(90, 1),
    TRUST_PROXY: text('127.0.0.1'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default(isProduction ? 'info' : 'debug'),
    OTEL_SERVICE_NAME: text('petcare-api'),
    OTEL_EXPORTER_OTLP_ENDPOINT: text(isProduction ? 'http://lgtm:4318' : 'http://localhost:4318'),
    OTEL_SDK_DISABLED: bool(false),
  });
}

export type Provider = 'google' | 'github' | 'microsoft' | 'apple';

/** The typed Config object every module receives. */
export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  appOrigin: string;
  databaseUrl: string;
  redisUrl: string;
  redisKeyPrefix: string;
  authSecret: string;
  sessionMaxAgeDays: number;
  emailPasswordEnabled: boolean;
  providers: Record<Provider, { clientId: string; clientSecret: string; tenantId?: string } | null>;
  vapid: { publicKey: string; privateKey: string; subject: string } | null;
  vapidSubject: string;
  filesDir: string;
  maxFileBytes: number;
  householdQuotaBytes: number;
  runMigrations: boolean;
  runJobs: boolean;
  notificationWindowDays: number;
  dispatchBatch: number;
  dispatchCron: string;
  extendCron: string;
  purgeCron: string;
  retentionDays: number;
  trustProxy: string;
  logLevel: string;
  otel: { serviceName: string; endpoint: string; disabled: boolean };
}

function pair(id: string | undefined, secret: string | undefined) {
  return id && secret ? { clientId: id, clientSecret: secret } : null;
}

export class ConfigError extends Error {}

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ''),
  );
  const isProduction = cleaned.NODE_ENV === 'production';
  const parsed = schemaFor(isProduction).safeParse(cleaned);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`invalid configuration: ${problems}`);
  }
  const e = parsed.data;
  const microsoft = pair(e.AUTH_MICROSOFT_CLIENT_ID, e.AUTH_MICROSOFT_CLIENT_SECRET);
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    appOrigin: e.APP_ORIGIN,
    databaseUrl: e.DATABASE_URL,
    redisUrl: e.REDIS_URL,
    redisKeyPrefix: e.REDIS_KEY_PREFIX,
    authSecret: e.BETTER_AUTH_SECRET,
    sessionMaxAgeDays: e.SESSION_MAX_AGE_DAYS,
    emailPasswordEnabled: e.EMAIL_PASSWORD_ENABLED,
    providers: {
      google: pair(e.AUTH_GOOGLE_CLIENT_ID, e.AUTH_GOOGLE_CLIENT_SECRET),
      github: pair(e.AUTH_GITHUB_CLIENT_ID, e.AUTH_GITHUB_CLIENT_SECRET),
      microsoft: microsoft ? { ...microsoft, tenantId: e.AUTH_MICROSOFT_TENANT_ID } : null,
      apple: pair(e.AUTH_APPLE_CLIENT_ID, e.AUTH_APPLE_CLIENT_SECRET),
    },
    vapid:
      e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY
        ? {
            publicKey: e.VAPID_PUBLIC_KEY,
            privateKey: e.VAPID_PRIVATE_KEY,
            subject: e.VAPID_SUBJECT,
          }
        : null,
    vapidSubject: e.VAPID_SUBJECT,
    filesDir: e.FILES_DIR,
    maxFileBytes: e.MAX_FILE_BYTES,
    householdQuotaBytes: e.HOUSEHOLD_QUOTA_BYTES,
    runMigrations: e.RUN_MIGRATIONS,
    runJobs: e.RUN_JOBS,
    notificationWindowDays: e.NOTIFICATION_WINDOW_DAYS,
    dispatchBatch: e.DISPATCH_BATCH,
    dispatchCron: e.DISPATCH_CRON,
    extendCron: e.EXTEND_CRON,
    purgeCron: e.PURGE_CRON,
    retentionDays: e.RETENTION_DAYS,
    trustProxy: e.TRUST_PROXY,
    logLevel: e.LOG_LEVEL,
    otel: {
      serviceName: e.OTEL_SERVICE_NAME,
      endpoint: e.OTEL_EXPORTER_OTLP_ENDPOINT,
      disabled: e.OTEL_SDK_DISABLED,
    },
  };
}
