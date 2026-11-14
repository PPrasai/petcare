import {
  SYNC_BACKOFF_MAX_MS,
  SYNC_BACKOFF_START_MS,
  SYNC_DEBOUNCE_MS,
  SYNC_INTERVAL_MS,
} from '@petcare/domain';
import type { SyncEngine } from './engine';

export interface Scheduler {
  /** Start the periodic sync (first run is immediate). */
  start(): void;
  stop(): void;
  /** A local write or a trigger happened: sync soon (debounced). */
  request(): void;
  /** The browser came back online: sync now and forget the backoff. */
  nudge(): void;
}

export interface SchedulerOptions {
  debounceMs?: number;
  intervalMs?: number;
  backoffStartMs?: number;
  backoffMaxMs?: number;
}

/**
 * When to sync: debounced after writes, every minute while idle, and with exponential
 * backoff (5 s doubling to 5 min) while the server cannot be reached.
 */
export function createScheduler(engine: SyncEngine, options: SchedulerOptions = {}): Scheduler {
  const debounceMs = options.debounceMs ?? SYNC_DEBOUNCE_MS;
  const intervalMs = options.intervalMs ?? SYNC_INTERVAL_MS;
  const backoffStart = options.backoffStartMs ?? SYNC_BACKOFF_START_MS;
  const backoffMax = options.backoffMaxMs ?? SYNC_BACKOFF_MAX_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let running = false;
  /** A write was requested while a sync was in flight; it must not wait for the next interval. */
  let requested = false;

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const schedule = (delay: number) => {
    clear();
    if (!running) return;
    timer = setTimeout(() => void run(), delay);
  };
  async function run(): Promise<void> {
    clear();
    requested = false;
    const status = await engine.sync();
    if (status.error !== null || !status.online) {
      failures += 1;
      schedule(Math.min(backoffStart * 2 ** (failures - 1), backoffMax));
    } else {
      failures = 0;
      schedule(requested ? debounceMs : intervalMs);
    }
  }

  return {
    start() {
      running = true;
      void run();
    },
    stop() {
      running = false;
      clear();
    },
    request() {
      if (!running) return;
      requested = true;
      schedule(debounceMs);
    },
    nudge() {
      if (!running) return;
      failures = 0;
      void run();
    },
  };
}
