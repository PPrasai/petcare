import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScheduler } from './scheduler';
import type { SyncEngine, SyncStatus } from './engine';

const ok: SyncStatus = {
  online: true,
  pendingCount: 0,
  lastSyncedAt: null,
  syncing: false,
  error: null,
};
const down: SyncStatus = { ...ok, online: false, error: 'network unavailable' };

function fakeEngine(results: SyncStatus[]) {
  const sync = vi.fn(async () => results.shift() ?? ok);
  const engine: SyncEngine = {
    sync,
    getStatus: () => ok,
    subscribe: () => () => undefined,
    refreshPending: async () => undefined,
  };
  return { engine, sync };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('sync scheduler', () => {
  it('syncs at start, then every interval', async () => {
    const { engine, sync } = fakeEngine([]);
    const scheduler = createScheduler(engine, { intervalMs: 60_000 });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sync).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it('debounces bursts of writes into one sync', async () => {
    const { engine, sync } = fakeEngine([]);
    const scheduler = createScheduler(engine, { debounceMs: 2_000, intervalMs: 600_000 });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    sync.mockClear();
    scheduler.request();
    await vi.advanceTimersByTimeAsync(1_000);
    scheduler.request();
    await vi.advanceTimersByTimeAsync(1_900);
    expect(sync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(sync).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it('backs off 5 s, 10 s, 20 s while the server is unreachable, then resets', async () => {
    const { engine, sync } = fakeEngine([down, down, down, ok]);
    const scheduler = createScheduler(engine, {
      backoffStartMs: 5_000,
      backoffMaxMs: 300_000,
      intervalMs: 60_000,
    });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sync).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sync).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sync).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sync).toHaveBeenCalledTimes(5);
    scheduler.stop();
  });

  it('caps the backoff and a nudge syncs at once', async () => {
    const { engine, sync } = fakeEngine(Array.from({ length: 12 }, () => down));
    const scheduler = createScheduler(engine, { backoffStartMs: 100_000, backoffMaxMs: 300_000 });
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100_000);
    await vi.advanceTimersByTimeAsync(200_000);
    expect(sync).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(299_999);
    expect(sync).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(sync).toHaveBeenCalledTimes(4);
    scheduler.nudge();
    await vi.advanceTimersByTimeAsync(0);
    expect(sync).toHaveBeenCalledTimes(5);
    scheduler.stop();
  });

  it('does nothing after stop', async () => {
    const { engine, sync } = fakeEngine([]);
    const scheduler = createScheduler(engine);
    scheduler.start();
    await vi.advanceTimersByTimeAsync(0);
    scheduler.stop();
    scheduler.request();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
