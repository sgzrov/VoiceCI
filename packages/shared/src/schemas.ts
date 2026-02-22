import { z } from "zod";
import { AUDIO_TEST_NAMES } from "./types.js";

// ============================================================
// V2 Schemas — Dynamic voice agent testing
// ============================================================

export const AudioTestNameSchema = z.enum(AUDIO_TEST_NAMES);

export const ConversationTestSpecSchema = z.object({
  caller_prompt: z.string().min(1),
  max_turns: z.number().int().min(1).max(50).default(10),
  eval: z.array(z.string().min(1)).min(1),
});

export const TestSpecSchema = z
  .object({
    audio_tests: z.array(AudioTestNameSchema).optional(),
    conversation_tests: z.array(ConversationTestSpecSchema).optional(),
  })
  .refine(
    (d) => (d.audio_tests?.length ?? 0) + (d.conversation_tests?.length ?? 0) > 0,
    { message: "At least one audio_test or conversation_test is required" }
  );

export const AdapterTypeSchema = z.enum(["ws-voice", "sip", "webrtc"]);

export const ConversationTurnSchema = z.object({
  role: z.enum(["caller", "agent"]),
  text: z.string(),
  timestamp_ms: z.number(),
  audio_duration_ms: z.number().optional(),
});

export const EvalResultSchema = z.object({
  question: z.string(),
  relevant: z.boolean(),
  passed: z.boolean(),
  reasoning: z.string(),
});

export const ConversationMetricsSchema = z.object({
  turns: z.number(),
  mean_ttfb_ms: z.number(),
  total_duration_ms: z.number(),
});

export const AudioTestResultSchema = z.object({
  test_name: AudioTestNameSchema,
  status: z.enum(["pass", "fail"]),
  metrics: z.record(z.union([z.number(), z.boolean()])),
  duration_ms: z.number(),
  error: z.string().optional(),
});

export const ConversationTestResultSchema = z.object({
  caller_prompt: z.string(),
  status: z.enum(["pass", "fail"]),
  transcript: z.array(ConversationTurnSchema),
  eval_results: z.array(EvalResultSchema),
  duration_ms: z.number(),
  metrics: ConversationMetricsSchema,
});

export const RunAggregateV2Schema = z.object({
  audio_tests: z.object({
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
  }),
  conversation_tests: z.object({
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
  }),
  total_duration_ms: z.number(),
});

export const RunnerCallbackV2Schema = z.object({
  run_id: z.string().uuid(),
  status: z.enum(["pass", "fail"]),
  audio_results: z.array(AudioTestResultSchema),
  conversation_results: z.array(ConversationTestResultSchema),
  aggregate: RunAggregateV2Schema,
  error_text: z.string().optional(),
});
