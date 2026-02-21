ALTER TABLE "api_keys" ADD COLUMN "prefix" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "revoked_at" timestamp with time zone;