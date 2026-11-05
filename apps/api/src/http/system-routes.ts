import type { FastifyInstance } from 'fastify';
import type { Readiness } from '../services/readiness-service';

export interface SystemRouteDeps {
  readiness: () => Promise<Readiness>;
  publicConfig: () => unknown;
}

/** getHealth, getReady, getConfig (CON-petcare-001 tag `system`). */
export function registerSystemRoutes(app: FastifyInstance, deps: SystemRouteDeps): void {
  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/ready', async (_request, reply) => {
    const readiness = await deps.readiness();
    return reply.code(readiness.status === 'down' ? 503 : 200).send(readiness);
  });

  app.get('/api/config', async () => deps.publicConfig());
}
