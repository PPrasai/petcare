import { customType } from 'drizzle-orm/pg-core';

/** Timestamps are timestamptz and come back as JS Dates. */
export const tz = { withTimezone: true, mode: 'date' } as const;

/** Postgres bytea as a Node Buffer (token and file hashes). */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});
