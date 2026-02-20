DO $$ BEGIN
  CREATE TYPE "run_status" AS ENUM ('queued', 'running', 'pass', 'fail');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "source_type" AS ENUM ('bundle');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "scenario_status" AS ENUM ('pass', 'fail');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "status" "run_status" DEFAULT 'queued' NOT NULL,
  "source_type" "source_type" NOT NULL,
  "bundle_key" text NOT NULL,
  "bundle_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "duration_ms" integer,
  "aggregate_json" jsonb,
  "error_text" text
);

CREATE TABLE IF NOT EXISTS "scenario_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "status" "scenario_status" NOT NULL,
  "metrics_json" jsonb NOT NULL,
  "trace_json" jsonb NOT NULL,
  "trace_ref" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "baselines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "artifacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "runs"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "key" text NOT NULL,
  "content_type" text NOT NULL,
  "byte_size" bigint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
