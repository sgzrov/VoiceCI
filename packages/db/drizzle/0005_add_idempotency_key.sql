ALTER TABLE "runs" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "runs_idempotency_key_unique" ON "runs" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
