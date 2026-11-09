import { create } from 'zustand';

/** How long a toast stays on screen. */
export const TOAST_MS = 5000;

interface ToastState {
  message: string | null;
  /** Bumped on every toast so the same text shown twice restarts the timer. */
  serial: number;
  show: (message: string) => void;
  dismiss: () => void;
}

export const useToastStore = create<ToastState>()((set) => ({
  message: null,
  serial: 0,
  show: (message) => set((s) => ({ message, serial: s.serial + 1 })),
  dismiss: () => set({ message: null }),
}));
