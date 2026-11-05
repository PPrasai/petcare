import type { FastifyInstance } from 'fastify';
import type { HouseholdService } from '../services/household-service';
import type { InviteService } from '../services/invite-service';
import { requireActor } from './actor';
import { textParam, uuidParam } from './params';
import { AUTHENTICATED_LIMIT } from './rate-limiting';

const limited = { config: { rateLimit: AUTHENTICATED_LIMIT } };

/** Households, members and invites (CON-petcare-001 tags `households`, `invites`). */
export function registerHouseholdRoutes(
  app: FastifyInstance,
  households: HouseholdService,
  invites: InviteService,
): void {
  app.get('/api/households', limited, async (request) =>
    households.list(requireActor(request).userId),
  );

  app.post('/api/households', limited, async (request, reply) => {
    const created = await households.create(requireActor(request).userId, request.body);
    return reply.code(201).send(created);
  });

  app.patch('/api/households/:householdId', limited, async (request) =>
    households.rename(
      requireActor(request).userId,
      uuidParam(request, 'householdId'),
      request.body,
    ),
  );

  app.delete('/api/households/:householdId', limited, async (request, reply) => {
    await households.remove(
      requireActor(request).userId,
      uuidParam(request, 'householdId'),
      request.body,
    );
    return reply.code(204).send();
  });

  app.get('/api/households/:householdId/members', limited, async (request) =>
    households.members(requireActor(request).userId, uuidParam(request, 'householdId')),
  );

  app.patch('/api/households/:householdId/members/:userId', limited, async (request) =>
    households.changeRole(
      requireActor(request).userId,
      uuidParam(request, 'householdId'),
      textParam(request, 'userId'),
      request.body,
    ),
  );

  app.delete('/api/households/:householdId/members/:userId', limited, async (request, reply) => {
    await households.removeMember(
      requireActor(request).userId,
      uuidParam(request, 'householdId'),
      textParam(request, 'userId'),
    );
    return reply.code(204).send();
  });

  app.post('/api/households/:householdId/leave', limited, async (request, reply) => {
    await households.leave(requireActor(request).userId, uuidParam(request, 'householdId'));
    return reply.code(204).send();
  });

  app.post('/api/households/:householdId/transfer-ownership', limited, async (request) =>
    households.transferOwnership(
      requireActor(request).userId,
      uuidParam(request, 'householdId'),
      request.body,
    ),
  );

  app.get('/api/households/:householdId/invites', limited, async (request) =>
    invites.list(requireActor(request).userId, uuidParam(request, 'householdId')),
  );

  app.post('/api/households/:householdId/invites', limited, async (request, reply) => {
    const created = await invites.create(
      requireActor(request).userId,
      uuidParam(request, 'householdId'),
      request.body,
    );
    return reply.code(201).send(created);
  });

  app.delete('/api/households/:householdId/invites/:inviteId', limited, async (request, reply) => {
    await invites.revoke(
      requireActor(request).userId,
      uuidParam(request, 'householdId'),
      uuidParam(request, 'inviteId'),
    );
    return reply.code(204).send();
  });

  // The attempt limits (10/h per user, 30/h per IP, shared) are enforced inside the service.
  app.post('/api/invites/preview', async (request) =>
    invites.preview(requireActor(request).userId, request.ip, request.body),
  );

  app.post('/api/invites/accept', async (request) =>
    invites.accept(requireActor(request).userId, request.ip, request.body),
  );
}
