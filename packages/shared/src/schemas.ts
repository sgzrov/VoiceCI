import { z } from "zod";
import { AUDIO_TEST_NAMES } from "./types.js";

// ============================================================
// V2 Schemas — Dynamic voice agent testing
// ============================================================

export const AudioTestNameSchema = z.enum(AUDIO_TEST_NAMES);

export const ConversationTestSpecSchema = z.object({
  name: z.string().optional(),
  caller_prompt: z.string().min(1),
  max_turns: z.number().int().min(1).max(50).default(10),
  eval: z.array(z.string().min(1)).min(1),
  tool_call_eval: z.array(z.string().min(1)).optional(),
  silence_threshold_ms: z.number().int().min(200).max(10000).optional(),
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

export const AdapterTypeSchema = z.enum(["ws-voice", "sip", "webrtc", "vapi", "retell", "elevenlabs", "bland"]);

// ============================================================
// Tool call schemas
// ============================================================

export const ObservedToolCallSchema = z.object({
  name: z.string(),
  arguments: z.record(z.unknown()),
  result: z.unknown().optional(),
  successful: z.boolean().optional(),
  timestamp_ms: z.number().optional(),
  latency_ms: z.number().optional(),
});

export const ToolCallMetricsSchema = z.object({
  total: z.number().int().min(0),
  successful: z.number().int().min(0),
  failed: z.number().int().min(0),
  mean_latency_ms: z.number().optional(),
  names: z.array(z.string()),
});

export const PlatformConfigSchema = z.object({
  provider: z.enum(["vapi", "retell", "elevenlabs", "bland"]),
  api_key_env: z.string(),
  agent_id: z.string().optional(),
});

export const AudioTestThresholdsSchema = z.object({
  echo: z.object({ loop_threshold: z.number().int().min(1).optional() }).optional(),
  ttfb: z.object({ p95_threshold_ms: z.number().min(100).optional() }).optional(),
  barge_in: z.object({ stop_threshold_ms: z.number().min(100).optional() }).optional(),
  silence_handling: z.object({ silence_duration_ms: z.number().min(1000).optional() }).optional(),
  response_completeness: z.object({ min_word_count: z.number().int().min(1).optional() }).optional(),
}).optional();

export const ConversationTurnSchema = z.object({
  role: z.enum(["caller", "agent"]),
  text: z.string(),
  timestamp_ms: z.number(),
  audio_duration_ms: z.number().optional(),
  ttfb_ms: z.number().optional(),
  stt_confidence: z.number().optional(),
});

export const EvalResultSchema = z.object({
  question: z.string(),
  relevant: z.boolean(),
  passed: z.boolean(),
  reasoning: z.string(),
});

// ============================================================
// Deep metric schemas
// ============================================================

export const TranscriptMetricsSchema = z.object({
  wer: z.number().min(0).max(1).optional(),
  repetition_score: z.number().min(0).max(1).optional(),
  reprompt_count: z.number().int().min(0).optional(),
  filler_word_rate: z.number().min(0).optional(),
  words_per_minute: z.number().min(0).optional(),
  vocabulary_diversity: z.number().min(0).max(1).optional(),
});

export const LatencyMetricsSchema = z.object({
  ttfb_per_turn_ms: z.array(z.number()),
  p50_ttfb_ms: z.number(),
  p95_ttfb_ms: z.number(),
  p99_ttfb_ms: z.number(),
  first_turn_ttfb_ms: z.number(),
  total_silence_ms: z.number(),
  mean_turn_gap_ms: z.number(),
});

const SentimentValueSchema = z.enum(["positive", "neutral", "negative"]);

export const BehavioralMetricsSchema = z.object({
  intent_accuracy: z.object({ score: z.number(), reasoning: z.string() }).optional(),
  hallucination_detected: z.object({ detected: z.boolean(), reasoning: z.string() }).optional(),
  sentiment_caller: z.object({ value: SentimentValueSchema, reasoning: z.string() }).optional(),
  sentiment_agent: z.object({ value: SentimentValueSchema, reasoning: z.string() }).optional(),
  context_retention: z.object({ score: z.number(), reasoning: z.string() }).optional(),
  topic_drift: z.object({ score: z.number(), reasoning: z.string() }).optional(),
  empathy_score: z.object({ score: z.number(), reasoning: z.string() }).optional(),
  clarity_score: z.object({ score: z.number(), reasoning: z.string() }).optional(),
  safety_compliance: z.object({ compliant: z.boolean(), reasoning: z.string() }).optional(),
});

export const ConversationMetricsSchema = z.object({
  turns: z.number(),
  mean_ttfb_ms: z.number(),
  total_duration_ms: z.number(),
  talk_ratio: z.number().optional(),
  transcript: TranscriptMetricsSchema.optional(),
  latency: LatencyMetricsSchema.optional(),
  behavioral: BehavioralMetricsSchema.optional(),
  tool_calls: ToolCallMetricsSchema.optional(),
});

export const AudioTestResultSchema = z.object({
  test_name: AudioTestNameSchema,
  status: z.enum(["pass", "fail"]),
  metrics: z.record(z.union([z.number(), z.boolean()])),
  duration_ms: z.number(),
  error: z.string().optional(),
});

export const ConversationTestResultSchema = z.object({
  name: z.string().optional(),
  caller_prompt: z.string(),
  status: z.enum(["pass", "fail"]),
  transcript: z.array(ConversationTurnSchema),
  eval_results: z.array(EvalResultSchema),
  tool_call_eval_results: z.array(EvalResultSchema).optional(),
  observed_tool_calls: z.array(ObservedToolCallSchema).optional(),
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

// ============================================================
// Load testing schemas
// ============================================================

export const LoadPatternSchema = z.enum(["ramp", "spike", "sustained", "soak"]);

export const LoadTestTimepointSchema = z.object({
  elapsed_s: z.number(),
  active_connections: z.number(),
  ttfb_p50_ms: z.number(),
  ttfb_p95_ms: z.number(),
  ttfb_p99_ms: z.number(),
  error_rate: z.number(),
  errors_cumulative: z.number(),
});

export const LoadTestResultSchema = z.object({
  status: z.enum(["pass", "fail"]),
  pattern: LoadPatternSchema,
  target_concurrency: z.number(),
  actual_peak_concurrency: z.number(),
  total_calls: z.number(),
  successful_calls: z.number(),
  failed_calls: z.number(),
  timeline: z.array(LoadTestTimepointSchema),
  summary: z.object({
    ttfb_p50_ms: z.number(),
    ttfb_p95_ms: z.number(),
    ttfb_p99_ms: z.number(),
    error_rate: z.number(),
    breaking_point: z.number().optional(),
    mean_call_duration_ms: z.number(),
  }),
  duration_ms: z.number(),
});

// ============================================================
// voice-ci.json project configuration schema
// ============================================================

export const VoiceCIConfigSchema = z.object({
  version: z.string().default("1.0"),
  agent: z.object({
    name: z.string().min(1),
    description: z.string().min(1),
  }),
  connection: z.object({
    adapter: AdapterTypeSchema,
    target_phone_number: z.string().optional(),
    start_command: z.string().optional(),
    health_endpoint: z.string().default("/health"),
    agent_url: z.string().default("http://localhost:3001"),
  }),
  voice: z
    .object({
      tts: z.object({ voice_id: z.string().optional(), api_key_env: z.string().optional() }).optional(),
      stt: z.object({ api_key_env: z.string().optional() }).optional(),
      silence_threshold_ms: z.number().optional(),
      webrtc: z.object({ room: z.string().optional() }).optional(),
    })
    .optional(),
});
