import { z } from "zod";
import { RUN_MODES, RUN_STATUSES, SCENARIO_STATUSES, SOURCE_TYPES } from "./constants.js";

export const PresignRequestSchema = z.object({
  filename: z.string().optional(),
});

export const CreateRunSchema = z.object({
  source_type: z.enum(SOURCE_TYPES),
  bundle_key: z.string().min(1),
  bundle_hash: z.string().min(1),
  mode: z.enum(RUN_MODES).optional(),
});

export const ScenarioMetricsSchema = z.object({
  mean_latency_ms: z.number(),
  p95_latency_ms: z.number(),
  max_latency_ms: z.number(),
  duration_ms: z.number(),
  empty_response_count: z.number(),
  flow_completion_score: z.number(),
  token_usage: z.number().nullable(),
  cost_usd: z.number().nullable(),
});

export const TraceEntrySchema = z.object({
  role: z.enum(["user", "agent"]),
  text: z.string(),
  timestamp_ms: z.number(),
  latency_ms: z.number().optional(),
});

export const ScenarioResultPayloadSchema = z.object({
  name: z.string(),
  status: z.enum(SCENARIO_STATUSES),
  metrics: ScenarioMetricsSchema,
  trace: z.array(TraceEntrySchema),
  trace_ref: z.string().optional(),
});

export const AggregateMetricsSchema = z.object({
  total_scenarios: z.number(),
  passed: z.number(),
  failed: z.number(),
  mean_latency_ms: z.number(),
  p95_latency_ms: z.number(),
  max_latency_ms: z.number(),
  total_duration_ms: z.number(),
  total_token_usage: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
});

export const RunnerCallbackSchema = z.object({
  run_id: z.string().uuid(),
  status: z.enum(["pass", "fail"]),
  scenario_results: z.array(ScenarioResultPayloadSchema),
  aggregate: AggregateMetricsSchema,
  error_text: z.string().optional(),
});

export const ExpectationsSchema = z.object({
  flow_completion_min: z.number().min(0).max(1).optional(),
  max_latency_ms: z.number().positive().optional(),
  must_mention_keywords: z.array(z.string()).optional(),
  interruption_expected: z.boolean().optional(),
});

export const ScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  user_script: z.array(z.string()).min(1),
  expectations: ExpectationsSchema,
});

export const SuiteSchema = z.object({
  id: z.string(),
  name: z.string(),
  scenarios: z.array(ScenarioSchema).min(1),
});

export const McpRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});
