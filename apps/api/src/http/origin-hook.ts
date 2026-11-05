import type { FastifyInstance } from 'fastify';
import { AppError } from '../services/app-error';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Better Auth checks its own trustedOrigins; telemetry and public routes are cross-site by design. */
const EXEMPT_PREFIXES = ['/api/auth', '/api/telemetry', '/api/public'];

function isExempt(path: string): boolean {
  return EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Origin rule (CON-petcare-001 section 1): every non-GET request under /api, except the
 * exempt prefixes, must carry Origin == APP_ORIGIN, otherwise 403 badOrigin.
 */
export function registerOriginHook(app: FastifyInstance, appOrigin: string): void {
  app.addHook('onRequest', async (request) => {
    if (SAFE_METHODS.has(request.method)) return;
    const path = request.url.split('?')[0] ?? '';
    if (!path.startsWith('/api/') || isExempt(path)) return;
    if (request.headers.origin !== appOrigin) throw new AppError('badOrigin', 403);
  });
}
