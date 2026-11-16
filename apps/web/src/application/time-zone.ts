import { DEFAULT_PREFERENCES, isKnownTimeZone } from '@petcare/domain';
import type { Preferences } from '@petcare/domain';

/** This device's IANA time zone, or null when the browser reports none (or one it cannot use). */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone !== '' && isKnownTimeZone(zone) ? zone : null;
  } catch {
    return null;
  }
}

/** True while every preference is still what a new account gets (including the UTC zone). */
export function isUntouchedDefault(preferences: Preferences): boolean {
  return JSON.stringify(preferences) === JSON.stringify(DEFAULT_PREFERENCES);
}

/**
 * The preferences to save so a new account uses this device's time zone: only when nothing was
 * ever changed, and only when the device zone is a different valid one. Otherwise null.
 */
export function adoptDeviceTimeZone(
  preferences: Preferences,
  zone: string | null = deviceTimeZone(),
): Preferences | null {
  if (
    !zone ||
    !isKnownTimeZone(zone) ||
    zone === preferences.timeZone ||
    !isUntouchedDefault(preferences)
  )
    return null;
  return { ...preferences, timeZone: zone };
}
