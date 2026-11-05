import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../services/app-error';

export interface Actor {
  userId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in user, if the request carries a valid session. */
    actor: Actor | null;
  }
}

/** Paths that never carry a session the API acts on. */
const NO_SESSION_PREFIXES = ['/api/auth', '/api/public', '/api/telemetry', '/cal'];

/**
 * Resolves the session cookie into `request.actor` for every /api request, so rate limiting can
 * key on the user. It never rejects; routes that need a user add `requireActor`.
 */
export function registerActorResolution(
  app: FastifyInstance,
  getUserId: (headers: FastifyRequest['headers']) => Promise<string | null>,
): void {
  app.decorateRequest('actor', null);
  app.addHook('onRequest', async (request) => {
    const path = request.url.split('?')[0] ?? '';
    if (!path.startsWith('/api/') || NO_SESSION_PREFIXES.some((p) => path.startsWith(p))) return;
    if (!request.headers.cookie) return;
    const userId = await getUserId(request.headers);
    request.actor = userId ? { userId } : null;
  });
}

/** preHandler for routes that need a signed-in user: 401 unauthenticated otherwise. */
export function requireActor(request: FastifyRequest): Actor {
  if (!request.actor) throw new AppError('unauthenticated', 401);
  return request.actor;
}
