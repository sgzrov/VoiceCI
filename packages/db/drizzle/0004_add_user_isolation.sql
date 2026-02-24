DO $$ BEGIN
  CREATE TYPE "public"."test_type" AS ENUM('audio', 'conversation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TABLE "scenario_results" ADD COLUMN "test_type" "test_type";--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "api_key_id" uuid NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "runs" ADD CONSTRAINT "runs_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
