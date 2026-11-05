import { bigint, boolean, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { tz } from './columns';

/**
 * Better Auth's tables, written from its documented Drizzle schema (SPEC section 5.2:
 * `@better-auth/cli` is not used). `user.id` is text; CON-petcare-002 stores it as an opaque id.
 */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', tz).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', tz),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', tz),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', tz).notNull(),
  createdAt: timestamp('created_at', tz).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', tz).notNull().defaultNow(),
});

/** Better Auth's built-in rate limiter, stored in the database (AS section 6). */
export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
