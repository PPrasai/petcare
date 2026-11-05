import { DEFAULT_PREFERENCES } from '@petcare/domain';
import type { MeSnapshot } from '../../application/ports/auth-api';

const KEY = 'petcare-last-session';

/**
 * The last signed-in user, kept so the app can open offline from this device's own data.
 * It holds no secret: the session cookie stays with the browser.
 */
export function rememberSession(me: MeSnapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(me));
  } catch {
    // Storage unavailable: offline start will not work, nothing else changes.
  }
}

export function recalledSession(): MeSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const me = JSON.parse(raw) as MeSnapshot;
    return { ...me, preferences: me.preferences ?? DEFAULT_PREFERENCES };
  } catch {
    return null;
  }
}

export function forgetSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to remove.
  }
}
