import type { FastifyInstance } from 'fastify';
import type { SyncService } from '../services/sync-service';
import { requireActor } from './actor';
import { uuidParam } from './params';
import { AUTHENTICATED_LIMIT } from './rate-limiting';

const limited = { config: { rateLimit: AUTHENTICATED_LIMIT } };

/** syncPush, syncPull, resolveConflict (CON-petcare-001 tag `sync`). */
export function registerSyncRoutes(app: FastifyInstance, sync: SyncService): void {
  app.post('/api/sync/push', limited, async (request) =>
    sync.push(requireActor(request).userId, request.body),
  );

  app.get('/api/sync/pull', limited, async (request) =>
    sync.pull(requireActor(request).userId, request.query as { cursor?: string; limit?: string }),
  );

  app.post('/api/conflicts/:conflictId/resolve', limited, async (request) =>
    sync.resolveConflict(requireActor(request).userId, uuidParam(request, 'conflictId')),
  );
}
