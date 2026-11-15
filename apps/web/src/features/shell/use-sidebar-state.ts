import { useCallback, useState, useSyncExternalStore } from 'react';

/** Where the user's choice is kept (SPEC-petcare-004 5.4). */
export const SIDEBAR_KEY = 'pc:sidebar';
/** From this width the sidebar is open by default. A default only: panels reflow by content width. */
const EXPANDED_QUERY = '(min-width: 1280px)';

type Choice = 'collapsed' | 'expanded';

const read = (): Choice | null => {
  try {
    const value = localStorage.getItem(SIDEBAR_KEY);
    return value === 'collapsed' || value === 'expanded' ? value : null;
  } catch {
    // Storage blocked: the width default applies.
    return null;
  }
};

const subscribe = (notify: () => void) => {
  const query = window.matchMedia(EXPANDED_QUERY);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};

/**
 * Whether the sidebar is the 68 px rail. With no stored choice it follows the window width live
 * (open from 1280 px); once the user presses the toggle, the stored choice wins at every width.
 */
export function useSidebarState(): { collapsed: boolean; toggle: () => void } {
  const [stored, setStored] = useState<Choice | null>(read);
  const wide = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(EXPANDED_QUERY).matches,
    () => true,
  );
  const collapsed = stored ? stored === 'collapsed' : !wide;
  const toggle = useCallback(() => {
    const next: Choice = collapsed ? 'expanded' : 'collapsed';
    setStored(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next);
    } catch {
      // Not kept; the choice holds until the page is closed.
    }
  }, [collapsed]);
  return { collapsed, toggle };
}
