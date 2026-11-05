import type { Repositories, UnitOfWork } from '../repositories';
import type { PushSender } from './ports';

export const MAX_ATTEMPTS = 3;

export interface DispatchResult {
  /** Rows for which at least one device accepted the message. */
  sent: number;
  /** Rows closed because the user has no registered device. */
  noDevice: number;
  /** Rows dropped because the occurrence was answered, snoozed or superseded. */
  skipped: number;
  /** Rows that failed on every device and will be retried on the next tick. */
  retry: number;
  /** Subscriptions deleted after a 404 or 410. */
  removed: number;
}

export interface DispatcherDeps {
  unitOfWork: UnitOfWork;
  sender: PushSender;
  clock: () => Date;
  batch: number;
}

/**
 * Sends the notifications whose time has come (the `dispatch-notifications` job, every minute).
 * Rows are claimed with FOR UPDATE SKIP LOCKED, so two dispatchers never send the same row.
 */
export function createDispatcher(deps: DispatcherDeps) {
  const { unitOfWork, sender, clock, batch } = deps;

  async function stillWanted(
    repos: Repositories,
    row: Awaited<ReturnType<Repositories['notifications']['claimDue']>>[number],
    now: Date,
  ): Promise<'send' | 'drop' | { snoozedUntil: Date }> {
    const n = repos.notifications;
    if (await n.isCompleted(row.sourceType, row.sourceId, row.occurrenceAt)) return 'drop';
    const until = await n.snoozedUntil(row.userId, row.sourceType, row.sourceId, row.occurrenceAt);
    if (until && until > now) return { snoozedUntil: until };
    if (row.sourceType === 'vaccination' && (await n.isVaccinationSuperseded(row.sourceId))) {
      return 'drop';
    }
    return 'send';
  }

  /** One dispatcher tick: everything with `fireAt <= now` that has not been sent. */
  async function dispatchDue(): Promise<DispatchResult> {
    const result: DispatchResult = { sent: 0, noDevice: 0, skipped: 0, retry: 0, removed: 0 };
    const now = clock();
    await unitOfWork.run(async (repos) => {
      for (const row of await repos.notifications.claimDue(now, batch)) {
        const verdict = await stillWanted(repos, row, now);
        if (verdict === 'drop') {
          await repos.notifications.deleteScheduled([row.id]);
          result.skipped += 1;
          continue;
        }
        if (verdict !== 'send') {
          await repos.notifications.upsertScheduled([{ ...row, fireAt: verdict.snoozedUntil }]);
          result.skipped += 1;
          continue;
        }

        const subscriptions = await repos.notifications.subscriptionsOf(row.userId);
        let delivered = false;
        for (const subscription of subscriptions) {
          const outcome = await sender.send(subscription, {
            title: row.title,
            body: row.body,
            url: '/',
            tag: `${row.sourceType}:${row.sourceId}:${row.occurrenceAt.getTime()}`,
          });
          if (outcome.ok) {
            delivered = true;
            await repos.notifications.markSubscriptionSuccess(subscription.endpoint, now);
          } else if (outcome.gone) {
            await repos.notifications.deleteSubscriptionByEndpoint(subscription.endpoint);
            result.removed += 1;
          }
        }
        if (subscriptions.length === 0) {
          await repos.notifications.markSent(row.id, now);
          result.noDevice += 1;
        } else if (delivered) {
          await repos.notifications.markSent(row.id, now);
          result.sent += 1;
        } else if ((await repos.notifications.bumpAttempts(row.id)) >= MAX_ATTEMPTS) {
          await repos.notifications.markSent(row.id, now);
        } else {
          result.retry += 1;
        }
      }
    });
    return result;
  }

  /** Sends one test message to every device of a user; returns how many accepted it. */
  async function sendTest(userId: string): Promise<number> {
    const repos = unitOfWork.repositories;
    let accepted = 0;
    for (const subscription of await repos.notifications.subscriptionsOf(userId)) {
      const outcome = await sender.send(subscription, {
        title: 'PetCare',
        body: 'Notifications are working.',
        url: '/',
        tag: 'test',
      });
      if (outcome.ok) accepted += 1;
      else if (outcome.gone) {
        await repos.notifications.deleteSubscriptionByEndpoint(subscription.endpoint);
      }
    }
    return accepted;
  }

  return { dispatchDue, sendTest };
}
export type Dispatcher = ReturnType<typeof createDispatcher>;
