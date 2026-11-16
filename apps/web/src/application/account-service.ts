import { isKnownTimeZone, preferencesSchema } from '@petcare/domain';
import type { Preferences } from '@petcare/domain';
import { AccountError } from './ports/account-api';
import type {
  AccountApi,
  CalendarLink,
  CalendarLinkState,
  LinkedAccounts,
} from './ports/account-api';
import type { PreferenceDevice } from './ports/preference-device';

/** What saving preferences did: they are on this device; `pending` means the server has not heard yet. */
export interface PreferencesSaved {
  preferences: Preferences;
  pending: boolean;
}

/** Settings use cases: preferences, sign-in methods, calendar link, export and deletion. */
export class AccountService {
  private flushing: Promise<boolean> | null = null;

  constructor(
    private readonly api: AccountApi,
    /** Applies saved preferences on this device (store, theme, offline copy). */
    private readonly applied: (preferences: Preferences) => void,
    private readonly device: PreferenceDevice,
  ) {}

  /**
   * Offline first: the preferences are written to the device and take effect at once; the server
   * save is queued and retried (`flush`) until it succeeds. Invalid input never leaves the app.
   * In the demo they stay on the device and nothing is queued.
   */
  async savePreferences(input: Preferences): Promise<PreferencesSaved> {
    const preferences = preferencesSchema.parse(input);
    if (!isKnownTimeZone(preferences.timeZone)) throw new AccountError('invalid');
    const local = this.device.localOnly();
    await this.device.write(preferences, !local);
    this.applied(preferences);
    if (local) return { preferences, pending: false };
    return { preferences, pending: !(await this.flush()) };
  }

  /**
   * Sends the waiting preferences to the server. Resolves true when nothing is waiting any more,
   * false when it must be tried again later (offline, signed out, server trouble). A refusal of the
   * values themselves drops the waiting copy and throws, so it is not retried for ever.
   */
  flush(): Promise<boolean> {
    this.flushing ??= this.sendWaiting().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async sendWaiting(): Promise<boolean> {
    if (this.device.localOnly()) return true;
    const waiting = await this.device.pending();
    if (!waiting) return true;
    try {
      await this.api.savePreferences(waiting);
    } catch (error) {
      if (error instanceof AccountError && error.kind === 'invalid') {
        await this.device.settle(waiting);
        throw error;
      }
      return false;
    }
    await this.device.settle(waiting);
    // A newer save may have queued while this one was in flight.
    return (await this.device.pending()) === null ? true : this.sendWaiting();
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
