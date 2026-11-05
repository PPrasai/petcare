export interface SyncProblemItem {
  id: number;
  at: string;
  code: string;
  recordType: string;
  recordId: string;
  message: string;
}

/** What the screens may ask of the sync engine. */
export interface SyncControl {
  /** Push and pull now. Resolves with the error code when it did not finish, else null. */
  syncNow(): Promise<string | null>;
  pendingCount(): Promise<number>;
  problems(): Promise<SyncProblemItem[]>;
}
