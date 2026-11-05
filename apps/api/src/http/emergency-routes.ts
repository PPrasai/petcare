import type { FastifyInstance } from 'fastify';
import type { EmergencyService } from '../services/emergency-service';
import { requireActor } from './actor';
import { uuidParam } from './params';
import { AUTHENTICATED_LIMIT } from './rate-limiting';

const limited = { config: { rateLimit: AUTHENTICATED_LIMIT } };
/** 60 requests a minute per IP on the public page (CON-petcare-001 section 2.1). */
const publicLimit = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } };
const iso = (d: Date) => d.toISOString().replace(/\.000Z$/, 'Z');

/** createEmergencyLink, revokeEmergencyLink, getPublicEmergencyCard, getPublicEmergencyPhoto. */
export function registerEmergencyRoutes(app: FastifyInstance, emergency: EmergencyService): void {
  app.post('/api/emergency/:cardId/link', limited, async (request, reply) => {
    const link = await emergency.createLink(
      requireActor(request).userId,
      uuidParam(request, 'cardId'),
    );
    return reply.code(201).send({ url: link.url, createdAt: iso(link.createdAt) });
  });

  app.delete('/api/emergency/:cardId/link', limited, async (request, reply) => {
    await emergency.revokeLink(requireActor(request).userId, uuidParam(request, 'cardId'));
    return reply.code(204).send();
  });

  app.get<{ Params: { token: string } }>(
    '/api/public/emergency/:token',
    publicLimit,
    async (request, reply) => {
      const card = await emergency.publicCard(request.params.token);
      return reply.header('cache-control', 'no-store').send(card);
    },
  );

  app.get<{ Params: { token: string } }>(
    '/api/public/emergency/:token/photo',
    publicLimit,
    async (request, reply) => {
      const photo = await emergency.publicPhoto(request.params.token);
      return reply
        .header('content-type', photo.mimeType)
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', 'sandbox')
        .header('cache-control', 'no-store')
        .send(photo.bytes);
    },
  );
}
