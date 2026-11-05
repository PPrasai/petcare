import type { FastifyInstance } from 'fastify';
import type { PushService } from '../services/push-service';
import { requireActor } from './actor';
import { AUTHENTICATED_LIMIT } from './rate-limiting';

const limited = { config: { rateLimit: AUTHENTICATED_LIMIT } };

/** subscribePush, unsubscribePush, sendTestPush (CON-petcare-001 tag `notifications`). */
export function registerPushRoutes(app: FastifyInstance, push: PushService): void {
  app.post('/api/push/subscriptions', limited, async (request, reply) => {
    await push.subscribe(requireActor(request).userId, request.body, request.headers['user-agent']);
    return reply.code(201).send();
  });

  app.delete('/api/push/subscriptions', limited, async (request, reply) => {
    await push.unsubscribe(requireActor(request).userId, request.body);
    return reply.code(204).send();
  });

  app.post('/api/push/test', limited, async (request, reply) => {
    await push.sendTest(requireActor(request).userId);
    return reply.code(202).send();
  });
}
