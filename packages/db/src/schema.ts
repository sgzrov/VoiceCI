import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";

export const runStatusEnum = pgEnum("run_status", [
  "queued",
  "running",
  "pass",
  "fail",
]);

export const sourceTypeEnum = pgEnum("source_type", ["bundle"]);

export const scenarioStatusEnum = pgEnum("scenario_status", ["pass", "fail"]);

export const testTypeEnum = pgEnum("test_type", ["audio", "conversation"]);

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: runStatusEnum("status").notNull().default("queued"),
  source_type: sourceTypeEnum("source_type").notNull(),
  bundle_key: text("bundle_key").notNull(),
  bundle_hash: text("bundle_hash").notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  started_at: timestamp("started_at", { withTimezone: true }),
  finished_at: timestamp("finished_at", { withTimezone: true }),
  duration_ms: integer("duration_ms"),
  aggregate_json: jsonb("aggregate_json"),
  test_spec_json: jsonb("test_spec_json"),
  error_text: text("error_text"),
});

export const scenarioResults = pgTable("scenario_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  run_id: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: scenarioStatusEnum("status").notNull(),
  test_type: testTypeEnum("test_type"),
  metrics_json: jsonb("metrics_json").notNull(),
  trace_json: jsonb("trace_json").notNull(),
  trace_ref: text("trace_ref"),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const baselines = pgTable("baselines", {
  id: uuid("id").primaryKey().defaultRandom(),
  run_id: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  key_hash: text("key_hash").notNull().unique(),
  name: text("name").notNull(),
  prefix: text("prefix").notNull().default(""),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const artifacts = pgTable("artifacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  run_id: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  key: text("key").notNull(),
  content_type: text("content_type").notNull(),
  byte_size: bigint("byte_size", { mode: "number" }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
