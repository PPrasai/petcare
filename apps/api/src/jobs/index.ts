import { PgBoss } from 'pg-boss';
import type { Config } from '../config/env';
import type { Dispatcher } from '../services/notification-dispatcher';

export const DISPATCH_QUEUE = 'dispatch-notifications';
export const EXTEND_QUEUE = 'extend-schedules';
export const PURGE_QUEUE = 'purge';

export interface JobHandlers {
  dispatcher: Dispatcher;
  extend: () => Promise<number>;
  purge: () => Promise<unknown>;
}

export interface Jobs {
  stop(): Promise<void>;
}

/**
 * Starts the in-process pg-boss workers (AS 4.5): dispatch due notifications every minute and
 * re-derive all schedules nightly, purge old data nightly. Both are safe to run on several nodes; rows are claimed with
 * SKIP LOCKED and derivation is idempotent.
 */
export async function startJobs(
  config: Pick<Config, 'databaseUrl' | 'dispatchCron' | 'extendCron' | 'purgeCron'>,
  handlers: JobHandlers,
  onError: (error: unknown) => void,
): Promise<Jobs> {
  const boss = new PgBoss(config.databaseUrl);
  boss.on('error', onError);
  await boss.start();
  await boss.createQueue(DISPATCH_QUEUE);
  await boss.createQueue(EXTEND_QUEUE);
  await boss.createQueue(PURGE_QUEUE);
  await boss.schedule(DISPATCH_QUEUE, config.dispatchCron);
  await boss.schedule(EXTEND_QUEUE, config.extendCron, null, { tz: 'UTC' });
  await boss.schedule(PURGE_QUEUE, config.purgeCron, null, { tz: 'UTC' });
  await boss.work(DISPATCH_QUEUE, async () => {
    await handlers.dispatcher.dispatchDue();
  });
  await boss.work(EXTEND_QUEUE, async () => {
    await handlers.extend();
  });
  await boss.work(PURGE_QUEUE, async () => {
    await handlers.purge();
  });
  return { stop: () => boss.stop({ graceful: true, timeout: 10_000 }) };
}
