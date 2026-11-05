import type { Preferences } from '@petcare/domain';

export type AccountErrorKind =
  'offline' | 'invalid' | 'soleOwner' | 'rateLimited' | 'signedOut' | 'other';

export class AccountError extends Error {
  constructor(readonly kind: AccountErrorKind) {
    super(kind);
    this.name = 'AccountError';
  }
}

export interface LinkedAccounts {
  /** Provider ids other than email + password. */
  providers: string[];
  hasPassword: boolean;
}

export interface CalendarLinkState {
  exists: boolean;
  createdAt: string | null;
}

/** Shown once, when the link is created. The address carries the secret token. */
export interface CalendarLink {
  url: string;
  createdAt: string;
}

/** Everything under Settings that talks to the server (CAP-19, CAP-20, CAP-08, CAP-02). */
export interface AccountApi {
  savePreferences(preferences: Preferences): Promise<Preferences>;
  linkedAccounts(): Promise<LinkedAccounts>;
  /** Where to send the browser to connect another sign-in provider. */
  linkProvider(provider: string): Promise<string>;
  unlinkProvider(provider: string): Promise<void>;
  setPassword(newPassword: string): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  calendarLink(): Promise<CalendarLinkState>;
  createCalendarLink(): Promise<CalendarLink>;
  revokeCalendarLink(): Promise<void>;
  /** The ZIP of everything the user can see. */
  exportData(): Promise<Blob>;
  /** Deletes the account and what only the user owns. */
  deleteAccount(): Promise<void>;
}
