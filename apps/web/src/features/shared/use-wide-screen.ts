import { useSyncExternalStore } from 'react';

/** The breakpoint where the phone layout becomes the desktop layout (AS-petcare-002 3.1). */
export const WIDE_QUERY = '(min-width: 860px)';

const subscribe = (notify: () => void) => {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};

/** True from 860 px up. Used where only one of two layouts may exist in the page at a time. */
export function useWideScreen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}
