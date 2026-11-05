/** Hard-coded constants (SPEC section 5.6). */
export const MAX_MUTATIONS_PER_PUSH = 100;
export const PULL_LIMIT_DEFAULT = 500;
export const PULL_LIMIT_MAX = 1000;

export const SYNC_DEBOUNCE_MS = 2_000;
export const SYNC_INTERVAL_MS = 60_000;
export const SYNC_BACKOFF_START_MS = 5_000;
export const SYNC_BACKOFF_MAX_MS = 300_000;

export const INVITE_EXPIRY_DAYS = 7;
export const INVITE_CODE_LENGTH = 10;

export const CALENDAR_PAST_DAYS = 30;
export const CALENDAR_FUTURE_DAYS = 365;

export const FILE_CACHE_MAX_BYTES = 100 * 1024 * 1024;

export const TELEMETRY_RELAY_MAX_BYTES = 256 * 1024;
export const TELEMETRY_RELAY_PER_MINUTE = 30;

/** Overdue items stay listed until done, for up to this many days (CON-002 2.6). */
export const OVERDUE_LIST_DAYS = 30;
/** Occurrences without a time of day are due at this local time (CON-002 2.6). */
export const DEFAULT_DUE_TIME = '09:00';
