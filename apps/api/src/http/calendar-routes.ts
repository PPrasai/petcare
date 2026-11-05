import type { FastifyInstance } from 'fastify';
import type { CalendarService } from '../services/calendar-service';
import { requireActor } from './actor';
import { AUTHENTICATED_LIMIT } from './rate-limiting';

const limited = { config: { rateLimit: AUTHENTICATED_LIMIT } };
const iso = (d: Date) => d.toISOString().replace(/\.000Z$/, 'Z');

/** getCalendarLink, createCalendarLink, revokeCalendarLink, getCalendarFeed (tag `calendar`). */
export function registerCalendarRoutes(app: FastifyInstance, calendar: CalendarService): void {
  app.get('/api/calendar/link', limited, async (request) => {
    const { exists, createdAt } = await calendar.linkExists(requireActor(request).userId);
    return { exists, createdAt: createdAt ? iso(createdAt) : null };
  });

  app.post('/api/calendar/link', limited, async (request, reply) => {
    const link = await calendar.createLink(requireActor(request).userId);
    return reply.code(201).send({ url: link.url, createdAt: iso(link.createdAt) });
  });

  app.delete('/api/calendar/link', limited, async (request, reply) => {
    await calendar.revokeLink(requireActor(request).userId);
    return reply.code(204).send();
  });

  // The feed is public: the 43-character token is the credential. Rate limiting is per token.
  app.get<{ Params: { token: string } }>('/cal/:token.ics', async (request, reply) => {
    const feed = await calendar.feed(request.params.token);
    return reply
      .header('content-type', 'text/calendar; charset=utf-8')
      .header('cache-control', 'private, max-age=300')
      .send(feed);
  });
}
