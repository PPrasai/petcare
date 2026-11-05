import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tz } from './columns';
import { recordColumns, versionCheck } from './record-columns';

export const pets = pgTable(
  'pets',
  {
    ...recordColumns(),
    name: text('name').notNull(),
    species: text('species').notNull(),
    speciesOther: text('species_other'),
    breed: text('breed'),
    isMixedBreed: boolean('is_mixed_breed').notNull().default(false),
    sex: text('sex').notNull().default('unknown'),
    neutered: boolean('neutered'),
    birthDate: date('birth_date', { mode: 'string' }),
    birthDateEstimated: boolean('birth_date_estimated').notNull().default(false),
    colour: text('colour'),
    markings: text('markings'),
    microchipId: text('microchip_id'),
    photoFileId: uuid('photo_file_id'),
    adoptedOn: date('adopted_on', { mode: 'string' }),
    insurance: jsonb('insurance'),
    diet: text('diet'),
    bloodType: text('blood_type'),
    sizeCategory: text('size_category'),
    archivedAt: timestamp('archived_at', tz),
    archivedReason: text('archived_reason'),
  },
  (t) => [index('pets_household_idx').on(t.householdId), versionCheck('pets', t.version)],
);

export const measurements = pgTable(
  'measurements',
  {
    ...recordColumns(),
    petId: uuid('pet_id').notNull(),
    kind: text('kind').notNull(),
    value: numeric('value', { precision: 12, scale: 4, mode: 'number' }).notNull(),
    measuredAt: timestamp('measured_at', tz).notNull(),
    note: text('note'),
  },
  (t) => [
    index('measurements_pet_idx').on(t.petId, t.kind, t.measuredAt),
    versionCheck('measurements', t.version),
    check('measurements_value_check', sql`${t.value} > 0`),
  ],
);

export const vaccinations = pgTable(
  'vaccinations',
  {
    ...recordColumns(),
    petId: uuid('pet_id').notNull(),
    vaccineName: text('vaccine_name').notNull(),
    givenOn: date('given_on', { mode: 'string' }).notNull(),
    batchNumber: text('batch_number'),
    contactId: uuid('contact_id'),
    nextDueOn: date('next_due_on', { mode: 'string' }),
    certificateFileId: uuid('certificate_file_id'),
    note: text('note'),
  },
  (t) => [
    index('vaccinations_pet_idx').on(t.petId),
    index('vaccinations_due_idx')
      .on(t.householdId, t.nextDueOn)
      .where(sql`${t.deletedAt} IS NULL`),
    versionCheck('vaccinations', t.version),
  ],
);

export const medications = pgTable(
  'medications',
  {
    ...recordColumns(),
    petId: uuid('pet_id').notNull(),
    name: text('name').notNull(),
    dose: numeric('dose', { precision: 12, scale: 4, mode: 'number' }),
    doseUnit: text('dose_unit'),
    schedule: jsonb('schedule').notNull(),
    prescribedByContactId: uuid('prescribed_by_contact_id'),
    note: text('note'),
  },
  (t) => [index('medications_pet_idx').on(t.petId), versionCheck('medications', t.version)],
);

export const medicationDoses = pgTable(
  'medication_doses',
  {
    ...recordColumns(),
    medicationId: uuid('medication_id').notNull(),
    petId: uuid('pet_id').notNull(),
    occurrenceAt: timestamp('occurrence_at', tz).notNull(),
    givenAt: timestamp('given_at', tz).notNull(),
    skipped: boolean('skipped').notNull().default(false),
    note: text('note'),
  },
  (t) => [
    index('medication_doses_med_idx').on(t.medicationId, t.occurrenceAt),
    versionCheck('medication_doses', t.version),
  ],
);

export const vetVisits = pgTable(
  'vet_visits',
  {
    ...recordColumns(),
    petId: uuid('pet_id').notNull(),
    visitedOn: date('visited_on', { mode: 'string' }).notNull(),
    contactId: uuid('contact_id'),
    reason: text('reason'),
    findings: text('findings'),
    diagnosis: text('diagnosis'),
    treatment: text('treatment'),
    costMinor: bigint('cost_minor', { mode: 'number' }),
    currency: char('currency', { length: 3 }),
    fileIds: uuid('file_ids')
      .array()
      .notNull()
      .default(sql`'{}'`),
    followUpOn: date('follow_up_on', { mode: 'string' }),
  },
  (t) => [
    index('vet_visits_pet_idx').on(t.petId, t.visitedOn),
    versionCheck('vet_visits', t.version),
    check('vet_visits_cost_minor_check', sql`${t.costMinor} >= 0`),
  ],
);

export const conditions = pgTable(
  'conditions',
  {
    ...recordColumns(),
    petId: uuid('pet_id').notNull(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    severity: text('severity'),
    diagnosedOn: date('diagnosed_on', { mode: 'string' }),
    resolvedOn: date('resolved_on', { mode: 'string' }),
    note: text('note'),
  },
  (t) => [index('conditions_pet_idx').on(t.petId), versionCheck('conditions', t.version)],
);

export const symptomEntries = pgTable(
  'symptom_entries',
  {
    ...recordColumns(),
    petId: uuid('pet_id').notNull(),
    observedAt: timestamp('observed_at', tz).notNull(),
    description: text('description').notNull(),
    severity: text('severity'),
    fileIds: uuid('file_ids')
      .array()
      .notNull()
      .default(sql`'{}'`),
  },
  (t) => [
    index('symptom_entries_pet_idx').on(t.petId, t.observedAt),
    versionCheck('symptom_entries', t.version),
  ],
);
