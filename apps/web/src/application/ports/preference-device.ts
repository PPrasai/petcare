import type { Preferences } from '@petcare/domain';

/**
 * Where this device keeps the user's preferences (offline first). A real account's preferences are
 * written here before the server hears about them; `pending` returns the ones it has not.
 */
export interface PreferenceDevice {
  /** True in the demo: preferences stay on this device and nothing is sent. */
  localOnly(): boolean;
  /** Keeps the preferences on this device; `pending` marks them as not yet saved on the server. */
  write(preferences: Preferences, pending: boolean): Promise<void>;
  /** The preferences still waiting for the server, if any. */
  pending(): Promise<Preferences | null>;
  /** The server has `sent`: forget the waiting copy unless a newer one replaced it meanwhile. */
  settle(sent: Preferences): Promise<void>;
}
