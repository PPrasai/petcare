import { create } from 'zustand';

interface ConnectivityState {
  /** Whether the server could be reached the last time we tried (and the browser is online). */
  online: boolean;
  pendingCount: number;
  lastSyncedAt: string | null;
  syncing: boolean;
  error: string | null;
  update: (patch: Partial<Omit<ConnectivityState, 'update' | 'reset'>>) => void;
  reset: () => void;
}

const initial = {
  online: true,
  pendingCount: 0,
  lastSyncedAt: null,
  syncing: false,
  error: null,
};

export const useConnectivityStore = create<ConnectivityState>()((set) => ({
  ...initial,
  update: (patch) => set(patch),
  reset: () => set(initial),
}));
