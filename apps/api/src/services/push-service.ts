import { z } from 'zod';
import type { UnitOfWork } from '../repositories';
import { AppError, invalid } from './app-error';
import type { Dispatcher } from './notification-dispatcher';
import type { Limiter } from './ports';

const TEST_LIMIT = { max: 5, windowSeconds: 3600 };

const subscriptionInput = z.strictObject({
  endpoint: z.url().max(2048).startsWith('https://'),
  keys: z.strictObject({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
const endpointInput = z.strictObject({ endpoint: z.url().max(2048) });

export interface PushServiceDeps {
  unitOfWork: UnitOfWork;
  dispatcher: Dispatcher;
  limiter: Limiter;
  newId: () => string;
}

/** Device registration and the test notification (CON-petcare-001 tag `notifications`). */
export function createPushService(deps: PushServiceDeps) {
  const { unitOfWork, dispatcher, limiter, newId } = deps;

  return {
    /** Idempotent by endpoint; an endpoint registered by another user is re-bound to the caller. */
    async subscribe(userId: string, body: unknown, userAgent: string | undefined): Promise<void> {
      const parsed = subscriptionInput.safeParse(body);
      if (!parsed.success) throw invalid('not a valid push subscription');
      await unitOfWork.repositories.notifications.upsertSubscription({
        id: newId(),
        userId,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: userAgent?.slice(0, 300) ?? null,
      });
    },

    /** Removes the caller's registration; also succeeds when there is none. */
    async unsubscribe(userId: string, body: unknown): Promise<void> {
      const parsed = endpointInput.safeParse(body);
      if (!parsed.success) throw invalid('endpoint is required', '/endpoint');
      await unitOfWork.repositories.notifications.deleteSubscription(userId, parsed.data.endpoint);
    },

    /** Sends a test message to all of the caller's devices (5 an hour). */
    async sendTest(userId: string): Promise<void> {
      const { count, retryAfterSeconds } = await limiter.hit(
        `push-test:${userId}`,
        TEST_LIMIT.windowSeconds,
      );
      if (count > TEST_LIMIT.max) {
        throw new AppError('rateLimited', 429, undefined, undefined, retryAfterSeconds);
      }
      await dispatcher.sendTest(userId);
    },
  };
}
export type PushService = ReturnType<typeof createPushService>;
