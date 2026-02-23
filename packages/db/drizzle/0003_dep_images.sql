DO $$ BEGIN
  CREATE TYPE "public"."dep_image_status" AS ENUM('building', 'ready', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "dep_images" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "lockfile_hash" text NOT NULL,
  "image_ref" text NOT NULL,
  "base_image_ref" text,
  "status" "dep_image_status" DEFAULT 'building' NOT NULL,
  "builder_machine_id" text,
  "error_text" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ready_at" timestamp with time zone,
  CONSTRAINT "dep_images_lockfile_hash_unique" UNIQUE("lockfile_hash")
);
