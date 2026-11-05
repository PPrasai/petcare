import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { bytea, tz } from './columns';
import { recordColumns, versionCheck } from './record-columns';

export const documents = pgTable(
  'documents',
  {
    ...recordColumns(),
    petId: uuid('pet_id'),
    title: text('title').notNull(),
    category: text('category').notNull(),
    fileId: uuid('file_id').notNull(),
    linkedRecordType: text('linked_record_type'),
    linkedRecordId: uuid('linked_record_id'),
  },
  (t) => [
    index('documents_household_idx').on(t.householdId, t.petId),
    versionCheck('documents', t.version),
  ],
);

export const expenses = pgTable(
  'expenses',
  {
    ...recordColumns(),
    petId: uuid('pet_id'),
    spentOn: date('spent_on', { mode: 'string' }).notNull(),
    category: text('category').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    note: text('note'),
    fileId: uuid('file_id'),
  },
  (t) => [
    index('expenses_household_idx').on(t.householdId, t.spentOn),
    versionCheck('expenses', t.version),
    check('expenses_amount_minor_check', sql`${t.amountMinor} >= 0`),
  ],
);

export const contacts = pgTable(
  'contacts',
  {
    ...recordColumns(),
    name: text('name').notNull(),
    role: text('role').notNull(),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    website: text('website'),
    note: text('note'),
  },
  (t) => [index('contacts_household_idx').on(t.householdId), versionCheck('contacts', t.version)],
);

export const emergencyCards = pgTable(
  'emergency_cards',
  {
    ...recordColumns(),
    petId: uuid('pet_id').notNull(),
    visibleFields: text('visible_fields')
      .array()
      .notNull()
      .default(sql`'{}'`),
    ownerDisplayName: text('owner_display_name'),
    ownerPhone: text('owner_phone'),
    notes: text('notes'),
    isLost: boolean('is_lost').notNull().default(false),
    lostSince: timestamp('lost_since', tz),
    lostMessage: text('lost_message'),
  },
  (t) => [
    uniqueIndex('emergency_cards_pet_uq')
      .on(t.petId)
      .where(sql`${t.deletedAt} IS NULL`),
    versionCheck('emergency_cards', t.version),
  ],
);

/** Public link token for an emergency card: server-only, never synced. */
export const emergencyTokens = pgTable('emergency_tokens', {
  cardId: uuid('card_id')
    .primaryKey()
    .references(() => emergencyCards.id, { onDelete: 'cascade' }),
  tokenHash: bytea('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', tz).notNull().defaultNow(),
});
