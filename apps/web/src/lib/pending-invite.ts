const KEY = 'petcare-pending-invite';

/** An invite token read from a /join link, kept until the person has signed in. */
export function savePendingInvite(token: string): void {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // Private mode may block storage; the link can be opened again after signing in.
  }
}

export function pendingInvite(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
