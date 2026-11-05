import type { ConflictStore } from './ports/conflict-store';
import type { HouseholdApi } from './ports/household-api';
import { HouseholdError } from './ports/household-api';
import type { RecordStore } from './ports/record-store';
import type { ConflictItem } from './ports/remote-api';

/** Conflicts: a field two people changed at once. The newer edit won; this can bring back the other. */
export class ConflictService {
  constructor(
    private readonly store: ConflictStore,
    private readonly records: RecordStore,
    private readonly api: HouseholdApi,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  list(householdId: string): Promise<ConflictItem[]> {
    return this.store.list(householdId);
  }

  /** Whether "restore this value" is possible: the conflict names a field of a record that still exists. */
  canRestore(conflict: ConflictItem): boolean {
    return conflict.field !== null && conflict.reason === 'concurrentFieldEdit';
  }

  /**
   * Puts the replaced value back as a normal update (it syncs like any edit), then marks the
   * conflict as seen.
   */
  async restore(conflict: ConflictItem): Promise<void> {
    if (conflict.field === null) throw new Error('conflict has no field to restore');
    await this.records.update(conflict.recordType, conflict.recordId, {
      [conflict.field]: conflict.replacedValue,
    });
    await this.dismiss(conflict);
  }

  /** Marks the conflict as seen. The server is told when it can be reached. */
  async dismiss(conflict: ConflictItem): Promise<void> {
    await this.store.markResolved(conflict.id, this.clock().toISOString());
    try {
      await this.api.resolveConflict(conflict.id);
    } catch (error) {
      // Offline or refused: the local mark is enough for this device.
      if (!(error instanceof HouseholdError)) throw error;
    }
  }
}
