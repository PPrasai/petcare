import type { FastifyInstance } from 'fastify';
import type { AccountService } from '../services/account-service';
import type { ExportService } from '../services/export-service';
import { requireActor } from './actor';
import { AUTHENTICATED_LIMIT } from './rate-limiting';

const limited = { config: { rateLimit: AUTHENTICATED_LIMIT } };

/** getMe, deleteMe, putPreferences, exportMe (CON-petcare-001 tag `me`). */
export function registerMeRoutes(
  app: FastifyInstance,
  accounts: AccountService,
  exporter: ExportService,
): void {
  app.get('/api/me', limited, async (request) => {
    const { userId } = requireActor(request);
    return accounts.getMe(userId);
  });

  app.put('/api/me/preferences', limited, async (request) => {
    const { userId } = requireActor(request);
    return accounts.savePreferences(userId, request.body);
  });

  app.delete('/api/me', limited, async (request, reply) => {
    await accounts.deleteAccount(requireActor(request).userId, request.body);
    return reply.code(204).send();
  });

  app.get('/api/me/export', limited, async (request, reply) => {
    const archive = await exporter.build(requireActor(request).userId);
    return reply
      .header('content-type', 'application/zip')
      .header('content-disposition', 'attachment; filename="petcare-export.zip"')
      .header('cache-control', 'no-store')
      .send(archive);
  });
}
