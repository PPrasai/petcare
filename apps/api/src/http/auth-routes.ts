import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Metrics } from '../services/ports';

type Handler = (request: Request) => Promise<Response>;

/**
 * The Better Auth operations CON-petcare-001 documents (tag `auth`, x-owner: better-auth).
 * Only these paths are exposed; every other Better Auth endpoint stays unreachable.
 */
export const AUTH_ROUTES: { method: 'GET' | 'POST'; url: string }[] = [
  { method: 'POST', url: '/api/auth/sign-up/email' },
  { method: 'POST', url: '/api/auth/sign-in/email' },
  { method: 'POST', url: '/api/auth/sign-in/social' },
  { method: 'GET', url: '/api/auth/callback/:provider' },
  { method: 'POST', url: '/api/auth/callback/:provider' },
  { method: 'GET', url: '/api/auth/get-session' },
  { method: 'POST', url: '/api/auth/sign-out' },
  { method: 'POST', url: '/api/auth/link-social' },
  { method: 'GET', url: '/api/auth/list-accounts' },
  { method: 'POST', url: '/api/auth/unlink-account' },
  { method: 'POST', url: '/api/auth/change-password' },
  { method: 'POST', url: '/api/auth/set-password' },
  { method: 'POST', url: '/api/auth/reset-password' },
];

/** Builds the Web Request Better Auth expects from a Fastify request. */
function toWebRequest(request: FastifyRequest, origin: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  // Better Auth rate-limits by IP: use the address Fastify resolved from the trusted proxy,
  // never a client-supplied header.
  headers.set('x-forwarded-for', request.ip);

  let body: string | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body !== undefined) {
    body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
  }
  const init: RequestInit = { method: request.method, headers };
  if (body !== undefined) init.body = body;
  return new Request(new URL(request.url, origin), init);
}

/** Sign-in and sign-up routes counted in petcare_auth_signins_total. */
const SIGNIN_METHODS: Record<string, 'email' | 'social' | 'signUp'> = {
  '/api/auth/sign-in/email': 'email',
  '/api/auth/sign-in/social': 'social',
  '/api/auth/sign-up/email': 'signUp',
};

export function registerAuthRoutes(
  app: FastifyInstance,
  handler: Handler,
  origin: string,
  metrics?: Pick<Metrics, 'authSignin'>,
): void {
  // Encapsulated so the form parser (Apple's form_post callback) stays out of other routes.
  void app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_request, body, done) => done(null, body),
    );

    for (const route of AUTH_ROUTES) {
      scope.route({
        method: route.method,
        url: route.url,
        handler: async (request, reply) => {
          const response = await handler(toWebRequest(request, origin));
          const method = SIGNIN_METHODS[route.url];
          if (method) metrics?.authSignin(method, response.status < 400 ? 'ok' : 'failed');
          reply.status(response.status);
          response.headers.forEach((value, name) => {
            if (name.toLowerCase() !== 'set-cookie') reply.header(name, value);
          });
          const cookies = response.headers.getSetCookie();
          if (cookies.length > 0) reply.header('set-cookie', cookies);
          return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
        },
      });
    }
  });
}
