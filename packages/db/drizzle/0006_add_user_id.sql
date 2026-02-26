ALTER TABLE "api_keys" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "baselines" ADD COLUMN "user_id" text;--> statement-breakpoint
UPDATE "api_keys" SET "user_id" = 'user_legacy' WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "runs" SET "user_id" = 'user_legacy' WHERE "user_id" IS NULL;--> statement-breakpoint
UPDATE "baselines" SET "user_id" = 'user_legacy' WHERE "user_id" IS NULL;--> statement-breakpoint
ALTER TABLE "api_keys" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "baselines" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_api_keys_user_id" ON "api_keys" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_runs_user_id" ON "runs" ("user_id");
