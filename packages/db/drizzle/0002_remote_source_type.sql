ALTER TYPE "public"."source_type" ADD VALUE 'remote';--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "bundle_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ALTER COLUMN "bundle_hash" DROP NOT NULL;
