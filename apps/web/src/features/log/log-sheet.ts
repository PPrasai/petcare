import { create } from 'zustand';
import type { LogKind } from '../../application/log-service';

export interface LogSheetRequest {
  /** The pet to log for; defaults to the first pet. */
  petId?: string;
  /** Skips the kind picker and opens this form. */
  kind?: LogKind;
}

interface LogSheetState {
  request: LogSheetRequest | null;
  /** Bumped on every open so the sheet starts fresh even when reopened with the same request. */
  serial: number;
  open: (request?: LogSheetRequest) => void;
  close: () => void;
}

export const useLogSheetStore = create<LogSheetState>()((set) => ({
  request: null,
  serial: 0,
  open: (request = {}) => set((s) => ({ request, serial: s.serial + 1 })),
  close: () => set({ request: null }),
}));

/** The one way to open the Log sheet: `useLogSheet().open({ petId?, kind? })`. */
export function useLogSheet(): { open: (request?: LogSheetRequest) => void } {
  const open = useLogSheetStore((s) => s.open);
  return { open };
}
