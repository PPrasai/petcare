import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import type { Config, Provider } from '../config/env';
import type { Db } from '../db/connection';
import * as schema from '../db/schema';

export interface AuthDeps {
  config: Config;
  db: Db;
  /** Called after Better Auth creates a user (first sign-in): makes the personal household. */
  onUserCreated: (user: { id: string; name: string }) => Promise<void>;
  /** Test seam: replaces parts of a social provider's options (fake identity provider). */
  socialOverrides?: Partial<Record<Provider, Record<string, unknown>>>;
}

/** Sign-in and sign-up allow 5 attempts per minute (CON-petcare-001 section 2.1). */
const STRICT_RULE = { window: 60, max: 5 };

function socialProviders(config: Config, overrides: AuthDeps['socialOverrides']) {
  const p = config.providers;
  const enabled: Record<string, Record<string, unknown>> = {};
  if (p.google) enabled.google = { ...p.google, ...overrides?.google };
  if (p.github) enabled.github = { ...p.github, ...overrides?.github };
  if (p.microsoft) enabled.microsoft = { ...p.microsoft, ...overrides?.microsoft };
  if (p.apple) enabled.apple = { ...p.apple, ...overrides?.apple };
  return enabled;
}

/**
 * Better Auth (FM section 3d): sessions in Postgres, no email verification, no automatic account
 * linking, rate limits in the database (AS section 6, ADR-07).
 */
export function createAuth(deps: AuthDeps) {
  const { config, db } = deps;
  const secureCookies = config.nodeEnv === 'production' || config.appOrigin.startsWith('https://');
  const resetSink: { current: ((token: string) => void) | null } = { current: null };

  const auth = betterAuth({
    baseURL: config.appOrigin,
    basePath: '/api/auth',
    secret: config.authSecret,
    trustedOrigins: [config.appOrigin],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: config.emailPasswordEnabled,
      requireEmailVerification: false,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: 30 * 60,
      // The link goes to the operator's terminal only (reset-link CLI); there is no email.
      sendResetPassword: async ({ token }) => {
        resetSink.current?.(token);
      },
    },
    socialProviders: socialProviders(config, deps.socialOverrides),
    account: {
      accountLinking: {
        enabled: true, // explicit linking from Settings while signed in
        disableImplicitLinking: true, // never link by matching email (QA-20b)
        trustedProviders: [],
        allowDifferentEmails: true,
      },
    },
    session: {
      expiresIn: config.sessionMaxAgeDays * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/*': STRICT_RULE,
        '/sign-up/*': STRICT_RULE,
      },
    },
    advanced: {
      // Better Auth skips origin and CSRF checks when NODE_ENV=test unless told otherwise.
      // Say so explicitly: the checks are always on (QA-20e).
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: secureCookies,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: secureCookies },
    },
    onAPIError: { errorURL: `${config.appOrigin}/sign-in` },
    databaseHooks: {
      user: {
        create: {
          after: async (created) => {
            await deps.onUserCreated({ id: created.id, name: created.name });
          },
        },
      },
    },
  });

  return {
    /** Handles a Web Request for /api/auth/*. */
    handler: (request: Request): Promise<Response> => auth.handler(request),

    /** The signed-in user for these request headers, or null. */
    async getUserId(headers: IncomingHttpHeaders): Promise<string | null> {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
      return session?.user.id ?? null;
    },

    /**
     * Operator recovery (PO section 9 A-03): a one-time reset URL valid 30 minutes, or null if
     * no account has that email. Never logged; the CLI prints it to the terminal.
     */
    async createResetLink(email: string): Promise<string | null> {
      let token: string | null = null;
      resetSink.current = (t) => {
        token = t;
      };
      try {
        await auth.api.requestPasswordReset({
          body: { email, redirectTo: `${config.appOrigin}/reset-password` },
        });
      } finally {
        resetSink.current = null;
      }
      return token ? `${config.appOrigin}/reset-password?token=${token}` : null;
    },
  };
}
export type Auth = ReturnType<typeof createAuth>;
