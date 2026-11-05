import type { FastifyInstance } from 'fastify';

/**
 * One log line per response. The route is the template (/cal/:token.ics), never the raw URL,
 * so secret tokens in paths never reach logs (CON-petcare-001 section 2.2).
 * Request bodies, cookies and headers are not logged.
 */
export function registerRequestLogging(app: FastifyInstance): void {
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        route: request.routeOptions.url ?? 'unmatched',
        status: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
      },
      'request',
    );
  });
}
