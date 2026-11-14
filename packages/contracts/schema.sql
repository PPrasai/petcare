-- PetCare Postgres schema (CON-petcare-003, normative; supersedes CON-petcare-002, expand-only delta). Target: PostgreSQL 17, database "petcare".
-- Implementation expresses this in Drizzle (apps/api/src/db/schema/*.ts); the generated migration must produce
-- an equivalent schema (checked by the schema-diff test, SPEC §5). Better Auth's own tables (user, session,
-- account, verification) are created by its Drizzle adapter schema and are NOT redefined here; "user".id is text.

-- ---------- Households & access ----------
CREATE TABLE households (
  id            uuid PRIMARY KEY,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text NOT NULL
);

CREATE TABLE memberships (
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id       text NOT NULL,
  role          text NOT NULL CHECK (role IN ('owner','caretaker','viewer')),
  joined_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);
CREATE INDEX memberships_user_idx ON memberships (user_id);

CREATE TABLE invites (
  id            uuid PRIMARY KEY,
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('caretaker','viewer')),
  token_hash    bytea NOT NULL UNIQUE,          -- sha256 of 32-byte link token
  code_hash     bytea NOT NULL UNIQUE,          -- sha256 of normalised 10-char Crockford code
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,           -- created_at + 7 days
  used_at       timestamptz,
  used_by       text,
  revoked_at    timestamptz
);
CREATE INDEX invites_household_idx ON invites (household_id);

CREATE TABLE user_preferences (
  user_id                 text PRIMARY KEY,
  weight_unit             text NOT NULL DEFAULT 'kg'  CHECK (weight_unit IN ('kg','lb')),
  length_unit             text NOT NULL DEFAULT 'cm'  CHECK (length_unit IN ('cm','in')),
  temperature_unit        text NOT NULL DEFAULT 'c'   CHECK (temperature_unit IN ('c','f')),
  time_zone               text NOT NULL DEFAULT 'UTC',
  date_format             text NOT NULL DEFAULT 'iso' CHECK (date_format IN ('iso','dmy','mdy')),
  currency                text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  theme                   text NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
  lead_vaccination_min    integer NOT NULL DEFAULT 10080 CHECK (lead_vaccination_min BETWEEN 0 AND 43200),  -- 7 days
  lead_medication_min     integer NOT NULL DEFAULT 0     CHECK (lead_medication_min BETWEEN 0 AND 1440),
  lead_routine_min        integer NOT NULL DEFAULT 0     CHECK (lead_routine_min BETWEEN 0 AND 1440),
  lead_reminder_min       integer NOT NULL DEFAULT 0     CHECK (lead_reminder_min BETWEEN 0 AND 43200),
  lead_vet_followup_min   integer NOT NULL DEFAULT 1440  CHECK (lead_vet_followup_min BETWEEN 0 AND 43200),
  push_enabled            boolean NOT NULL DEFAULT true,
  push_types              text[]  NOT NULL DEFAULT ARRAY['vaccination','medication','careRoutine','reminder','vetVisit'],
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ---------- Synced records: common columns on every record table ----------
-- id uuid PK (client UUIDv7) | household_id uuid FK | version int | created_at | created_by | updated_at | updated_by | deleted_at
-- Every record table below has exactly these leading columns; listed once here as a template and repeated verbatim.

CREATE TABLE pets (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  name text NOT NULL, species text NOT NULL, species_other text, breed text, is_mixed_breed boolean NOT NULL DEFAULT false,
  sex text NOT NULL DEFAULT 'unknown', neutered boolean, birth_date date, birth_date_estimated boolean NOT NULL DEFAULT false,
  colour text, markings text, microchip_id text, photo_file_id uuid, adopted_on date, insurance jsonb, diet text,
  blood_type text, size_category text, archived_at timestamptz, archived_reason text
);
CREATE INDEX pets_household_idx ON pets (household_id);

CREATE TABLE measurements (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  pet_id uuid NOT NULL, kind text NOT NULL, value numeric(12,4) NOT NULL CHECK (value > 0), measured_at timestamptz NOT NULL, note text
);
CREATE INDEX measurements_pet_idx ON measurements (pet_id, kind, measured_at);

CREATE TABLE vaccinations (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  pet_id uuid NOT NULL, vaccine_name text NOT NULL, given_on date NOT NULL, batch_number text, contact_id uuid,
  next_due_on date, certificate_file_id uuid, note text
);
CREATE INDEX vaccinations_pet_idx ON vaccinations (pet_id);
CREATE INDEX vaccinations_due_idx ON vaccinations (household_id, next_due_on) WHERE deleted_at IS NULL;

CREATE TABLE medications (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  pet_id uuid NOT NULL, name text NOT NULL, dose numeric(12,4), dose_unit text, schedule jsonb NOT NULL,
  prescribed_by_contact_id uuid, note text
);
CREATE INDEX medications_pet_idx ON medications (pet_id);

CREATE TABLE medication_doses (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  medication_id uuid NOT NULL, pet_id uuid NOT NULL, occurrence_at timestamptz NOT NULL, given_at timestamptz NOT NULL,
  skipped boolean NOT NULL DEFAULT false, note text
);
CREATE INDEX medication_doses_med_idx ON medication_doses (medication_id, occurrence_at);

CREATE TABLE vet_visits (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  pet_id uuid NOT NULL, visited_on date NOT NULL, contact_id uuid, reason text, findings text, diagnosis text,
  treatment text, cost_minor bigint CHECK (cost_minor >= 0), currency char(3), file_ids uuid[] NOT NULL DEFAULT '{}',
  follow_up_on date
);
CREATE INDEX vet_visits_pet_idx ON vet_visits (pet_id, visited_on);

CREATE TABLE conditions (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  pet_id uuid NOT NULL, kind text NOT NULL, name text NOT NULL, severity text, diagnosed_on date, resolved_on date, note text
);
CREATE INDEX conditions_pet_idx ON conditions (pet_id);

CREATE TABLE symptom_entries (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  pet_id uuid NOT NULL, observed_at timestamptz NOT NULL, description text NOT NULL, severity text,
  file_ids uuid[] NOT NULL DEFAULT '{}'
);
CREATE INDEX symptom_entries_pet_idx ON symptom_entries (pet_id, observed_at);

CREATE TABLE care_routines (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  pet_id uuid NOT NULL, kind text NOT NULL, title text NOT NULL, schedule jsonb NOT NULL, active boolean NOT NULL DEFAULT true, note text
);
CREATE INDEX care_routines_pet_idx ON care_routines (pet_id);

CREATE TABLE care_completions (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  routine_id uuid NOT NULL, pet_id uuid NOT NULL, occurrence_at timestamptz NOT NULL, completed_at timestamptz NOT NULL,
  skipped boolean NOT NULL DEFAULT false, note text
);
CREATE INDEX care_completions_routine_idx ON care_completions (routine_id, occurrence_at);

CREATE TABLE reminders (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  pet_id uuid, title text NOT NULL, schedule jsonb NOT NULL, active boolean NOT NULL DEFAULT true, note text,
  category text, audience_user_id text                      -- CON-petcare-003: nullable, no default (expand-only)
);
CREATE INDEX reminders_household_idx ON reminders (household_id);

CREATE TABLE reminder_completions (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  reminder_id uuid NOT NULL, occurrence_at timestamptz NOT NULL, completed_at timestamptz NOT NULL
);
CREATE INDEX reminder_completions_idx ON reminder_completions (reminder_id, occurrence_at);

CREATE TABLE reminder_snoozes (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  source_type text NOT NULL, source_id uuid NOT NULL, occurrence_at timestamptz NOT NULL, snoozed_until timestamptz NOT NULL,
  user_id text NOT NULL
);
CREATE INDEX reminder_snoozes_idx ON reminder_snoozes (source_id, occurrence_at, user_id);

CREATE TABLE documents (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  pet_id uuid, title text NOT NULL, category text NOT NULL, file_id uuid NOT NULL, linked_record_type text, linked_record_id uuid
);
CREATE INDEX documents_household_idx ON documents (household_id, pet_id);

CREATE TABLE expenses (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  pet_id uuid, spent_on date NOT NULL, category text NOT NULL, amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL, note text, file_id uuid
);
CREATE INDEX expenses_household_idx ON expenses (household_id, spent_on);

CREATE TABLE contacts (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  name text NOT NULL, role text NOT NULL, phone text, email text, address text, website text, note text
);
CREATE INDEX contacts_household_idx ON contacts (household_id);

-- CON-petcare-003 (Pebble): everyday care logs (appendOnly) and meal presets (mergeable)
CREATE TABLE care_logs (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  pet_id uuid NOT NULL, kind text NOT NULL, occurred_at timestamptz NOT NULL, note text,
  food_name text, quantity numeric(12,4) CHECK (quantity > 0), quantity_unit text,
  duration_min integer CHECK (duration_min BETWEEN 1 AND 1440), grooming_tasks text[] NOT NULL DEFAULT '{}',
  medication_name text, medication_id uuid, route text, dose_text text
);
CREATE INDEX care_logs_pet_idx ON care_logs (pet_id, occurred_at);

CREATE TABLE meal_presets (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  pet_id uuid NOT NULL, food_name text NOT NULL, quantity numeric(12,4) NOT NULL CHECK (quantity > 0), quantity_unit text NOT NULL
);
CREATE INDEX meal_presets_pet_idx ON meal_presets (pet_id);

CREATE TABLE emergency_cards (
  id uuid PRIMARY KEY, household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version >= 1), created_at timestamptz NOT NULL, created_by text NOT NULL,
  updated_at timestamptz NOT NULL, updated_by text NOT NULL, deleted_at timestamptz,
  pet_id uuid NOT NULL, visible_fields text[] NOT NULL DEFAULT '{}', owner_display_name text, owner_phone text,
  notes text, is_lost boolean NOT NULL DEFAULT false, lost_since timestamptz, lost_message text
);
CREATE UNIQUE INDEX emergency_cards_pet_uq ON emergency_cards (pet_id) WHERE deleted_at IS NULL;

-- Public link token for an emergency card: server-only, never synced.
CREATE TABLE emergency_tokens (
  card_id      uuid PRIMARY KEY REFERENCES emergency_cards(id) ON DELETE CASCADE,
  token_hash   bytea NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------- Sync bookkeeping ----------
CREATE TABLE change_log (
  seq            bigserial PRIMARY KEY,
  household_id   uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  record_type    text NOT NULL,
  record_id      uuid NOT NULL,
  version        integer NOT NULL,
  op             text NOT NULL CHECK (op IN ('create','update','delete')),
  changed_fields text[] NOT NULL,
  actor          text NOT NULL,
  at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX change_log_household_seq_idx ON change_log (household_id, seq);
CREATE INDEX change_log_record_idx ON change_log (record_id, version);

CREATE TABLE sync_mutations (
  mutation_id   uuid PRIMARY KEY,
  user_id       text NOT NULL,
  result        jsonb NOT NULL,                  -- the exact PushResult returned the first time
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conflicts (
  id               uuid PRIMARY KEY,
  household_id     uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  record_type      text NOT NULL,
  record_id        uuid NOT NULL,
  field            text,                         -- null when a whole update was rejected (delete wins)
  kept_value       jsonb,
  replaced_value   jsonb,
  replaced_by      text NOT NULL,                -- user whose value lost
  winning_by       text NOT NULL,
  reason           text NOT NULL CHECK (reason IN ('concurrentFieldEdit','updateAfterDelete')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  resolved_at      timestamptz,
  resolved_by      text
);
CREATE INDEX conflicts_household_idx ON conflicts (household_id, created_at) WHERE resolved_at IS NULL;

-- ---------- Files ----------
CREATE TABLE file_objects (
  id            uuid PRIMARY KEY,
  household_id  uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  mime_type     text NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp','image/heic','application/pdf')),
  size_bytes    bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  sha256        bytea NOT NULL,
  original_name text,                            -- display only; never used in paths; max 200 chars enforced in service
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE INDEX file_objects_household_idx ON file_objects (household_id) WHERE deleted_at IS NULL;

-- ---------- Notifications & calendar ----------
CREATE TABLE push_subscriptions (
  id            uuid PRIMARY KEY,
  user_id       text NOT NULL,
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id);

CREATE TABLE scheduled_notifications (
  id             uuid PRIMARY KEY,
  household_id   uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id        text NOT NULL,
  source_type    text NOT NULL CHECK (source_type IN ('vaccination','medication','careRoutine','reminder','vetVisit')),
  source_id      uuid NOT NULL,
  occurrence_at  timestamptz NOT NULL,
  fire_at        timestamptz NOT NULL,
  title          text NOT NULL,
  body           text NOT NULL,
  sent_at        timestamptz,
  attempts       integer NOT NULL DEFAULT 0,
  UNIQUE (user_id, source_type, source_id, occurrence_at)
);
CREATE INDEX scheduled_notifications_due_idx ON scheduled_notifications (fire_at) WHERE sent_at IS NULL;
CREATE INDEX scheduled_notifications_source_idx ON scheduled_notifications (source_id);

CREATE TABLE calendar_tokens (
  user_id      text PRIMARY KEY,
  token_hash   bytea NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now()
);
