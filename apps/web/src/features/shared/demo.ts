import { useSessionStore } from '../../state/session';

/** True while the on-device demo is open (CAP-03). */
export function useDemo(): boolean {
  return useSessionStore((s) => s.demo);
}
