import { describe, expect, it, vi } from 'vitest';
import { ConflictService } from './conflict-service';
import { HouseholdError } from './ports/household-api';
import type { HouseholdApi } from './ports/household-api';
import type { RecordStore } from './ports/record-store';
import type { ConflictItem } from './ports/remote-api';

const conflict = (patch: Partial<ConflictItem> = {}): ConflictItem => ({
  id: 'c1',
  householdId: 'h1',
  recordType: 'pet',
  recordId: 'p1',
  field: 'breed',
  keptValue: 'Pug',
  replacedValue: 'Beagle',
  replacedBy: 'u1',
  winningBy: 'u2',
  reason: 'concurrentFieldEdit',
  createdAt: '2026-06-01T10:00:00Z',
  resolvedAt: null,
  ...patch,
});

function setup(resolve: () => Promise<void> = async () => undefined) {
  const update = vi.fn(async () => ({}) as never);
  const markResolved = vi.fn(async () => undefined);
  const service = new ConflictService(
    { list: async () => [], markResolved },
    { update } as unknown as RecordStore,
    { resolveConflict: resolve } as unknown as HouseholdApi,
    () => new Date('2026-06-02T00:00:00Z'),
  );
  return { service, update, markResolved };
}

describe('ConflictService', () => {
  it('restores the replaced value as a normal update, then marks the conflict seen', async () => {
    const { service, update, markResolved } = setup();
    await service.restore(conflict());
    expect(update).toHaveBeenCalledWith('pet', 'p1', { breed: 'Beagle' });
    expect(markResolved).toHaveBeenCalledWith('c1', '2026-06-02T00:00:00.000Z');
  });

  it('only offers restore for a field that two edits changed at once', () => {
    const { service } = setup();
    expect(service.canRestore(conflict())).toBe(true);
    expect(service.canRestore(conflict({ reason: 'updateAfterDelete', field: null }))).toBe(false);
  });

  it('keeps the local mark when the server cannot be reached', async () => {
    const { service, markResolved } = setup(async () => {
      throw new HouseholdError('offline');
    });
    await service.dismiss(conflict());
    expect(markResolved).toHaveBeenCalledOnce();
  });
});
