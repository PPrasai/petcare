import { preferencesSchema } from '@petcare/domain';
import type { Preferences } from '@petcare/domain';
import type {
  AccountApi,
  CalendarLink,
  CalendarLinkState,
  LinkedAccounts,
} from './ports/account-api';

/** Settings use cases: preferences, sign-in methods, calendar link, export and deletion. */
export class AccountService {
  constructor(
    private readonly api: AccountApi,
    /** Applies saved preferences on this device (store, theme, offline copy). */
    private readonly applied: (preferences: Preferences) => void,
  ) {}

  /** Saves to the server first, then applies on the device; invalid input never leaves the app. */
  async savePreferences(input: Preferences): Promise<Preferences> {
    const preferences = preferencesSchema.parse(input);
    const saved = await this.api.savePreferences(preferences);
    this.applied(saved);
    return saved;
  }

  linkedAccounts(): Promise<LinkedAccounts> {
    return this.api.linkedAccounts();
  }
  linkProvider(provider: string): Promise<string> {
    return this.api.linkProvider(provider);
  }
  unlinkProvider(provider: string): Promise<void> {
    return this.api.unlinkProvider(provider);
  }
  setPassword(newPassword: string): Promise<void> {
    return this.api.setPassword(newPassword);
  }
  changePassword(current: string, next: string): Promise<void> {
    return this.api.changePassword(current, next);
  }
  calendarLink(): Promise<CalendarLinkState> {
    return this.api.calendarLink();
  }
  createCalendarLink(): Promise<CalendarLink> {
    return this.api.createCalendarLink();
  }
  revokeCalendarLink(): Promise<void> {
    return this.api.revokeCalendarLink();
  }
  exportData(): Promise<Blob> {
    return this.api.exportData();
  }
  deleteAccount(): Promise<void> {
    return this.api.deleteAccount();
  }
}
