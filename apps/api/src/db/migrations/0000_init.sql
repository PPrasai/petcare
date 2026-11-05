CREATE TABLE "households" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "households_name_check" CHECK (char_length("households"."name") BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"role" text NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"code_hash" "bytea" NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by" text,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invites_code_hash_unique" UNIQUE("code_hash"),
	CONSTRAINT "invites_role_check" CHECK ("invites"."role" IN ('caretaker','viewer'))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"household_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_household_id_user_id_pk" PRIMARY KEY("household_id","user_id"),
	CONSTRAINT "memberships_role_check" CHECK ("memberships"."role" IN ('owner','caretaker','viewer'))
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"weight_unit" text DEFAULT 'kg' NOT NULL,
	"length_unit" text DEFAULT 'cm' NOT NULL,
	"temperature_unit" text DEFAULT 'c' NOT NULL,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"date_format" text DEFAULT 'iso' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"lead_vaccination_min" integer DEFAULT 10080 NOT NULL,
	"lead_medication_min" integer DEFAULT 0 NOT NULL,
	"lead_routine_min" integer DEFAULT 0 NOT NULL,
	"lead_reminder_min" integer DEFAULT 0 NOT NULL,
	"lead_vet_followup_min" integer DEFAULT 1440 NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"push_types" text[] DEFAULT ARRAY['vaccination','medication','careRoutine','reminder','vetVisit'] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_weight_unit_check" CHECK ("user_preferences"."weight_unit" IN ('kg','lb')),
	CONSTRAINT "user_preferences_length_unit_check" CHECK ("user_preferences"."length_unit" IN ('cm','in')),
	CONSTRAINT "user_preferences_temperature_unit_check" CHECK ("user_preferences"."temperature_unit" IN ('c','f')),
	CONSTRAINT "user_preferences_date_format_check" CHECK ("user_preferences"."date_format" IN ('iso','dmy','mdy')),
	CONSTRAINT "user_preferences_currency_check" CHECK ("user_preferences"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "user_preferences_theme_check" CHECK ("user_preferences"."theme" IN ('system','light','dark')),
	CONSTRAINT "user_preferences_lead_vaccination_min_check" CHECK ("user_preferences"."lead_vaccination_min" BETWEEN 0 AND 43200),
	CONSTRAINT "user_preferences_lead_medication_min_check" CHECK ("user_preferences"."lead_medication_min" BETWEEN 0 AND 1440),
	CONSTRAINT "user_preferences_lead_routine_min_check" CHECK ("user_preferences"."lead_routine_min" BETWEEN 0 AND 1440),
	CONSTRAINT "user_preferences_lead_reminder_min_check" CHECK ("user_preferences"."lead_reminder_min" BETWEEN 0 AND 43200),
	CONSTRAINT "user_preferences_lead_vet_followup_min_check" CHECK ("user_preferences"."lead_vet_followup_min" BETWEEN 0 AND 43200)
);
--> statement-breakpoint
CREATE TABLE "conditions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"pet_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"severity" text,
	"diagnosed_on" date,
	"resolved_on" date,
	"note" text,
	CONSTRAINT "conditions_version_check" CHECK ("conditions"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"pet_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" numeric(12, 4) NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"note" text,
	CONSTRAINT "measurements_version_check" CHECK ("measurements"."version" >= 1),
	CONSTRAINT "measurements_value_check" CHECK ("measurements"."value" > 0)
);
--> statement-breakpoint
CREATE TABLE "medication_doses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"medication_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"occurrence_at" timestamp with time zone NOT NULL,
	"given_at" timestamp with time zone NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"note" text,
	CONSTRAINT "medication_doses_version_check" CHECK ("medication_doses"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "medications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"pet_id" uuid NOT NULL,
	"name" text NOT NULL,
	"dose" numeric(12, 4),
	"dose_unit" text,
	"schedule" jsonb NOT NULL,
	"prescribed_by_contact_id" uuid,
	"note" text,
	CONSTRAINT "medications_version_check" CHECK ("medications"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"species" text NOT NULL,
	"species_other" text,
	"breed" text,
	"is_mixed_breed" boolean DEFAULT false NOT NULL,
	"sex" text DEFAULT 'unknown' NOT NULL,
	"neutered" boolean,
	"birth_date" date,
	"birth_date_estimated" boolean DEFAULT false NOT NULL,
	"colour" text,
	"markings" text,
	"microchip_id" text,
	"photo_file_id" uuid,
	"adopted_on" date,
	"insurance" jsonb,
	"diet" text,
	"blood_type" text,
	"size_category" text,
	"archived_at" timestamp with time zone,
	"archived_reason" text,
	CONSTRAINT "pets_version_check" CHECK ("pets"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "symptom_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"pet_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"severity" text,
	"file_ids" uuid[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "symptom_entries_version_check" CHECK ("symptom_entries"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "vaccinations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"pet_id" uuid NOT NULL,
	"vaccine_name" text NOT NULL,
	"given_on" date NOT NULL,
	"batch_number" text,
	"contact_id" uuid,
	"next_due_on" date,
	"certificate_file_id" uuid,
	"note" text,
	CONSTRAINT "vaccinations_version_check" CHECK ("vaccinations"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "vet_visits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"pet_id" uuid NOT NULL,
	"visited_on" date NOT NULL,
	"contact_id" uuid,
	"reason" text,
	"findings" text,
	"diagnosis" text,
	"treatment" text,
	"cost_minor" bigint,
	"currency" char(3),
	"file_ids" uuid[] DEFAULT '{}' NOT NULL,
	"follow_up_on" date,
	CONSTRAINT "vet_visits_version_check" CHECK ("vet_visits"."version" >= 1),
	CONSTRAINT "vet_visits_cost_minor_check" CHECK ("vet_visits"."cost_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "care_completions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"routine_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"occurrence_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"note" text,
	CONSTRAINT "care_completions_version_check" CHECK ("care_completions"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "care_routines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"pet_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"schedule" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	CONSTRAINT "care_routines_version_check" CHECK ("care_routines"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "reminder_completions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"reminder_id" uuid NOT NULL,
	"occurrence_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "reminder_completions_version_check" CHECK ("reminder_completions"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "reminder_snoozes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"occurrence_at" timestamp with time zone NOT NULL,
	"snoozed_until" timestamp with time zone NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "reminder_snoozes_version_check" CHECK ("reminder_snoozes"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"pet_id" uuid,
	"title" text NOT NULL,
	"schedule" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"note" text,
	CONSTRAINT "reminders_version_check" CHECK ("reminders"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"website" text,
	"note" text,
	CONSTRAINT "contacts_version_check" CHECK ("contacts"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"pet_id" uuid,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"file_id" uuid NOT NULL,
	"linked_record_type" text,
	"linked_record_id" uuid,
	CONSTRAINT "documents_version_check" CHECK ("documents"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "emergency_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"pet_id" uuid NOT NULL,
	"visible_fields" text[] DEFAULT '{}' NOT NULL,
	"owner_display_name" text,
	"owner_phone" text,
	"notes" text,
	"is_lost" boolean DEFAULT false NOT NULL,
	"lost_since" timestamp with time zone,
	"lost_message" text,
	CONSTRAINT "emergency_cards_version_check" CHECK ("emergency_cards"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "emergency_tokens" (
	"card_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emergency_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"pet_id" uuid,
	"spent_on" date NOT NULL,
	"category" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"note" text,
	"file_id" uuid,
	CONSTRAINT "expenses_version_check" CHECK ("expenses"."version" >= 1),
	CONSTRAINT "expenses_amount_minor_check" CHECK ("expenses"."amount_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "change_log" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"record_type" text NOT NULL,
	"record_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"op" text NOT NULL,
	"changed_fields" text[] NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_log_op_check" CHECK ("change_log"."op" IN ('create','update','delete'))
);
--> statement-breakpoint
CREATE TABLE "conflicts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"record_type" text NOT NULL,
	"record_id" uuid NOT NULL,
	"field" text,
	"kept_value" jsonb,
	"replaced_value" jsonb,
	"replaced_by" text NOT NULL,
	"winning_by" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	CONSTRAINT "conflicts_reason_check" CHECK ("conflicts"."reason" IN ('concurrentFieldEdit','updateAfterDelete'))
);
--> statement-breakpoint
CREATE TABLE "sync_mutations" (
	"mutation_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_tokens" (
	"user_id" text PRIMARY KEY NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendar_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "file_objects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" "bytea" NOT NULL,
	"original_name" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "file_objects_mime_type_check" CHECK ("file_objects"."mime_type" IN ('image/jpeg','image/png','image/webp','image/heic','application/pdf')),
	CONSTRAINT "file_objects_size_bytes_check" CHECK ("file_objects"."size_bytes" > 0 AND "file_objects"."size_bytes" <= 10485760)
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "scheduled_notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"occurrence_at" timestamp with time zone NOT NULL,
	"fire_at" timestamp with time zone NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "scheduled_notifications_dedupe" UNIQUE("user_id","source_type","source_id","occurrence_at"),
	CONSTRAINT "scheduled_notifications_source_type_check" CHECK ("scheduled_notifications"."source_type" IN ('vaccination','medication','careRoutine','reminder','vetVisit'))
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_doses" ADD CONSTRAINT "medication_doses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medications" ADD CONSTRAINT "medications_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symptom_entries" ADD CONSTRAINT "symptom_entries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vet_visits" ADD CONSTRAINT "vet_visits_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_completions" ADD CONSTRAINT "care_completions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_routines" ADD CONSTRAINT "care_routines_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_completions" ADD CONSTRAINT "reminder_completions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_snoozes" ADD CONSTRAINT "reminder_snoozes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_cards" ADD CONSTRAINT "emergency_cards_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emergency_tokens" ADD CONSTRAINT "emergency_tokens_card_id_emergency_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."emergency_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conflicts" ADD CONSTRAINT "conflicts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_notifications" ADD CONSTRAINT "scheduled_notifications_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invites_household_idx" ON "invites" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conditions_pet_idx" ON "conditions" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "measurements_pet_idx" ON "measurements" USING btree ("pet_id","kind","measured_at");--> statement-breakpoint
CREATE INDEX "medication_doses_med_idx" ON "medication_doses" USING btree ("medication_id","occurrence_at");--> statement-breakpoint
CREATE INDEX "medications_pet_idx" ON "medications" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "pets_household_idx" ON "pets" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "symptom_entries_pet_idx" ON "symptom_entries" USING btree ("pet_id","observed_at");--> statement-breakpoint
CREATE INDEX "vaccinations_pet_idx" ON "vaccinations" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "vaccinations_due_idx" ON "vaccinations" USING btree ("household_id","next_due_on") WHERE "vaccinations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "vet_visits_pet_idx" ON "vet_visits" USING btree ("pet_id","visited_on");--> statement-breakpoint
CREATE INDEX "care_completions_routine_idx" ON "care_completions" USING btree ("routine_id","occurrence_at");--> statement-breakpoint
CREATE INDEX "care_routines_pet_idx" ON "care_routines" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "reminder_completions_idx" ON "reminder_completions" USING btree ("reminder_id","occurrence_at");--> statement-breakpoint
CREATE INDEX "reminder_snoozes_idx" ON "reminder_snoozes" USING btree ("source_id","occurrence_at","user_id");--> statement-breakpoint
CREATE INDEX "reminders_household_idx" ON "reminders" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "contacts_household_idx" ON "contacts" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "documents_household_idx" ON "documents" USING btree ("household_id","pet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emergency_cards_pet_uq" ON "emergency_cards" USING btree ("pet_id") WHERE "emergency_cards"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "expenses_household_idx" ON "expenses" USING btree ("household_id","spent_on");--> statement-breakpoint
CREATE INDEX "change_log_household_seq_idx" ON "change_log" USING btree ("household_id","seq");--> statement-breakpoint
CREATE INDEX "change_log_record_idx" ON "change_log" USING btree ("record_id","version");--> statement-breakpoint
CREATE INDEX "conflicts_household_idx" ON "conflicts" USING btree ("household_id","created_at") WHERE "conflicts"."resolved_at" IS NULL;--> statement-breakpoint
CREATE INDEX "file_objects_household_idx" ON "file_objects" USING btree ("household_id") WHERE "file_objects"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduled_notifications_due_idx" ON "scheduled_notifications" USING btree ("fire_at") WHERE "scheduled_notifications"."sent_at" IS NULL;--> statement-breakpoint
CREATE INDEX "scheduled_notifications_source_idx" ON "scheduled_notifications" USING btree ("source_id");