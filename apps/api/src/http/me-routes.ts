import type { FastifyInstance } from 'fastify';
import type { AccountService } from '../services/account-service';
import { requireActor } from './actor';
import { AUTHENTICATED_LIMIT } from './rate-limiting';

const limited = { config: { rateLimit: AUTHENTICATED_LIMIT } };

/** getMe, putPreferences (CON-petcare-001 tag `me`). */
export function registerMeRoutes(app: FastifyInstance, accounts: AccountService): void {
  app.get('/api/me', limited, async (request) => {
    const { userId } = requireActor(request);
    return accounts.getMe(userId);
  });

  app.put('/api/me/preferences', limited, async (request) => {
    const { userId } = requireActor(request);
    return accounts.savePreferences(userId, request.body);
  });
}
