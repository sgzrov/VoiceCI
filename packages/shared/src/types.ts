export type RunStatus = "queued" | "running" | "pass" | "fail";
export type SourceType = "bundle" | "remote";

export interface VoiceConfig {
  tts?: { voice_id?: string; api_key_env?: string };
  stt?: { api_key_env?: string };
  audio?: { sample_rate?: number };
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
}

export interface EvalResult {
  question: string;
  relevant: boolean;
  passed: boolean;
  reasoning: string;
}

export interface ConversationMetrics {
  turns: number;
  mean_ttfb_ms: number;
  total_duration_ms: number;
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
// voice-ci.json project configuration
// ============================================================

export interface VoiceCIConfig {
  version: string;
  agent: {
    name: string;
    description: string;
    system_prompt_file?: string;
    language?: string;
  };
  connection: {
    adapter: AdapterType;
    target_phone_number?: string;
    start_command?: string;
    health_endpoint?: string;
    agent_url?: string;
  };
  voice?: VoiceConfig;
  testing?: {
    max_parallel_runs?: number;
    default_max_turns?: number;
  };
}
