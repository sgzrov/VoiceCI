export type RunStatus = "queued" | "running" | "pass" | "fail";
export type SourceType = "bundle" | "remote";

export interface VoiceConfig {
  tts?: { voice_id?: string; api_key_env?: string };
  stt?: { api_key_env?: string };
  silence_threshold_ms?: number;
  telephony?: {
    auth_id_env?: string;
    auth_token_env?: string;
    from_number?: string;
  };
  webrtc?: {
    livekit_url_env?: string;
    api_key_env?: string;
    api_secret_env?: string;
    room?: string;
  };
}

// ============================================================
// Audio + Conversation test types
// ============================================================

export const AUDIO_TEST_NAMES = [
  "echo",
  "barge_in",
  "ttfb",
  "silence_handling",
  "connection_stability",
  "response_completeness",
] as const;

export type AudioTestName = (typeof AUDIO_TEST_NAMES)[number];

export type AdapterType = "ws-voice" | "sip" | "webrtc";

export interface ConversationTestSpec {
  name?: string;
  caller_prompt: string;
  max_turns: number;
  eval: string[];
  silence_threshold_ms?: number;
}

export interface AudioTestThresholds {
  echo?: { loop_threshold?: number };
  ttfb?: { p95_threshold_ms?: number };
  barge_in?: { stop_threshold_ms?: number };
  silence_handling?: { silence_duration_ms?: number };
  response_completeness?: { min_word_count?: number };
}

export interface TestSpec {
  audio_tests?: AudioTestName[];
  conversation_tests?: ConversationTestSpec[];
}

export interface AudioTestResult {
  test_name: AudioTestName;
  status: "pass" | "fail";
  metrics: Record<string, number | boolean>;
  duration_ms: number;
  error?: string;
}

export interface ConversationTurn {
  role: "caller" | "agent";
  text: string;
  timestamp_ms: number;
  audio_duration_ms?: number;
  ttfb_ms?: number;
  stt_confidence?: number;
}

export interface EvalResult {
  question: string;
  relevant: boolean;
  passed: boolean;
  reasoning: string;
}

// ============================================================
// Deep metric types
// ============================================================

export interface TranscriptMetrics {
  wer?: number;
  repetition_score?: number;
  reprompt_count?: number;
  filler_word_rate?: number;
  words_per_minute?: number;
  vocabulary_diversity?: number;
}

export interface LatencyMetrics {
  ttfb_per_turn_ms: number[];
  p50_ttfb_ms: number;
  p95_ttfb_ms: number;
  p99_ttfb_ms: number;
  first_turn_ttfb_ms: number;
  total_silence_ms: number;
  mean_turn_gap_ms: number;
}

export type SentimentValue = "positive" | "neutral" | "negative";

export interface BehavioralMetrics {
  intent_accuracy?: { score: number; reasoning: string };
  hallucination_detected?: { detected: boolean; reasoning: string };
  sentiment_caller?: { value: SentimentValue; reasoning: string };
  sentiment_agent?: { value: SentimentValue; reasoning: string };
  context_retention?: { score: number; reasoning: string };
  topic_drift?: { score: number; reasoning: string };
  empathy_score?: { score: number; reasoning: string };
  clarity_score?: { score: number; reasoning: string };
  safety_compliance?: { compliant: boolean; reasoning: string };
}

export interface ConversationMetrics {
  turns: number;
  mean_ttfb_ms: number;
  total_duration_ms: number;
  talk_ratio?: number;
  transcript?: TranscriptMetrics;
  latency?: LatencyMetrics;
  behavioral?: BehavioralMetrics;
}

export interface ConversationTestResult {
  name?: string;
  caller_prompt: string;
  status: "pass" | "fail";
  transcript: ConversationTurn[];
  eval_results: EvalResult[];
  duration_ms: number;
  metrics: ConversationMetrics;
}

export interface RunAggregateV2 {
  audio_tests: { total: number; passed: number; failed: number };
  conversation_tests: { total: number; passed: number; failed: number };
  total_duration_ms: number;
}

export interface RunnerCallbackPayloadV2 {
  run_id: string;
  status: "pass" | "fail";
  audio_results: AudioTestResult[];
  conversation_results: ConversationTestResult[];
  aggregate: RunAggregateV2;
  error_text?: string;
}

// ============================================================
// Load testing types
// ============================================================

export type LoadPattern = "ramp" | "spike" | "sustained" | "soak";

export interface LoadTestTimepoint {
  elapsed_s: number;
  active_connections: number;
  ttfb_p50_ms: number;
  ttfb_p95_ms: number;
  ttfb_p99_ms: number;
  error_rate: number;
  errors_cumulative: number;
}

export interface LoadTestResult {
  status: "pass" | "fail";
  pattern: LoadPattern;
  target_concurrency: number;
  actual_peak_concurrency: number;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  timeline: LoadTestTimepoint[];
  summary: {
    ttfb_p50_ms: number;
    ttfb_p95_ms: number;
    ttfb_p99_ms: number;
    error_rate: number;
    breaking_point?: number;
    mean_call_duration_ms: number;
  };
  duration_ms: number;
}

// ============================================================
// voice-ci.json project configuration
// ============================================================

export interface VoiceCIConfig {
  version: string;
  agent: {
    name: string;
    description: string;
  };
  connection: {
    adapter: AdapterType;
    target_phone_number?: string;
    start_command?: string;
    health_endpoint?: string;
    agent_url?: string;
  };
  voice?: VoiceConfig;
}
