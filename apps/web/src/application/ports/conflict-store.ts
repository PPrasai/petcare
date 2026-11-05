import type { ConflictItem } from './remote-api';

/** Conflicts the server reported for this device's household data (CAP-16). */
export interface ConflictStore {
  /** The household's conflicts, open ones first and newest first within each group. */
  list(householdId: string): Promise<ConflictItem[]>;
  /** Marks a conflict as seen on this device. */
  markResolved(conflictId: string, at: string): Promise<void>;
}
