import { create } from 'zustand';

/** How long a toast stays on screen (the Undo window, PO-petcare-002 Q-01). */
export const TOAST_MS = 5000;

export interface ToastOptions {
  /** Shows an Undo button that runs this. */
  undo?: () => void;
}

interface ToastState {
  message: string | null;
  undo: (() => void) | null;
  /** Bumped on every toast so the same text shown twice restarts the timer. */
  serial: number;
  show: (message: string, options?: ToastOptions) => void;
  dismiss: () => void;
}

export const useToastStore = create<ToastState>()((set) => ({
  message: null,
  undo: null,
  serial: 0,
  show: (message, options) =>
    set((s) => ({ message, undo: options?.undo ?? null, serial: s.serial + 1 })),
  dismiss: () => set({ message: null, undo: null }),
}));
