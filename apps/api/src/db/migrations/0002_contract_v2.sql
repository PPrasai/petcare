CREATE TABLE "care_logs" (
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
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text,
	"food_name" text,
	"quantity" numeric(12, 4),
	"quantity_unit" text,
	"duration_min" integer,
	"grooming_tasks" text[] DEFAULT '{}' NOT NULL,
	"medication_name" text,
	"medication_id" uuid,
	"route" text,
	"dose_text" text,
	CONSTRAINT "care_logs_version_check" CHECK ("care_logs"."version" >= 1),
	CONSTRAINT "care_logs_quantity_check" CHECK ("care_logs"."quantity" > 0),
	CONSTRAINT "care_logs_duration_min_check" CHECK ("care_logs"."duration_min" BETWEEN 1 AND 1440)
);
--> statement-breakpoint
CREATE TABLE "meal_presets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"pet_id" uuid NOT NULL,
	"food_name" text NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"quantity_unit" text NOT NULL,
	CONSTRAINT "meal_presets_version_check" CHECK ("meal_presets"."version" >= 1),
	CONSTRAINT "meal_presets_quantity_check" CHECK ("meal_presets"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "audience_user_id" text;--> statement-breakpoint
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_presets" ADD CONSTRAINT "meal_presets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "care_logs_pet_idx" ON "care_logs" USING btree ("pet_id","occurred_at");--> statement-breakpoint
CREATE INDEX "meal_presets_pet_idx" ON "meal_presets" USING btree ("pet_id");