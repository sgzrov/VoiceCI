export type RunStatus = "queued" | "running" | "pass" | "fail";
export type SourceType = "bundle";
export type ScenarioStatus = "pass" | "fail";
export type RunMode = "smoke" | "ci" | "deep";

export interface Run {
  id: string;
  status: RunStatus;
  source_type: SourceType;
  bundle_key: string;
  bundle_hash: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  aggregate_json: AggregateMetrics | null;
  error_text: string | null;
}

export interface ScenarioResult {
  id: string;
  run_id: string;
  name: string;
  status: ScenarioStatus;
  metrics_json: ScenarioMetrics;
  trace_json: TraceEntry[];
  trace_ref: string | null;
  created_at: string;
}

export interface ScenarioMetrics {
  mean_latency_ms: number;
  p95_latency_ms: number;
  max_latency_ms: number;
  duration_ms: number;
  empty_response_count: number;
  flow_completion_score: number;
  token_usage: number | null;
  cost_usd: number | null;
  // Voice metrics (populated when using voice adapters)
  mean_turn_gap_ms?: number;
  mean_stt_confidence?: number;
}

export interface AggregateMetrics {
  total_scenarios: number;
  passed: number;
  failed: number;
  mean_latency_ms: number;
  p95_latency_ms: number;
  max_latency_ms: number;
  total_duration_ms: number;
  total_token_usage: number | null;
  total_cost_usd: number | null;
  // Voice aggregate metrics (populated when using voice adapters)
  mean_turn_gap_ms?: number;
  mean_stt_confidence?: number;
}

export interface TraceEntry {
  role: "user" | "agent";
  text: string;
  timestamp_ms: number;
  latency_ms?: number;
  // Voice trace fields
  audio_ref?: string;
  audio_duration_ms?: number;
  stt_confidence?: number;
  time_to_first_byte_ms?: number;
}

export interface Failure {
  code: string;
  message: string;
  actual: string | number | null;
  expected: string | number | null;
  scenario: string;
}

export interface Baseline {
  id: string;
  run_id: string;
  created_at: string;
}

export interface Artifact {
  id: string;
  run_id: string;
  kind: string;
  key: string;
  content_type: string;
  byte_size: number;
  created_at: string;
}

export interface Scenario {
  id: string;
  name: string;
  user_script: string[];
  expectations: Expectations;
}

export interface Expectations {
  flow_completion_min?: number;
  max_latency_ms?: number;
  must_mention_keywords?: string[];
  interruption_expected?: boolean;
  // Voice expectations
  max_turn_gap_ms?: number;
  min_stt_confidence?: number;
}

export interface Suite {
  id: string;
  name: string;
  scenarios: Scenario[];
}

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

export interface VoiceCIConfig {
  suite?: string;
  suites?: string[];
  agent_url?: string;
  health_endpoint?: string;
  start_command?: string;
  adapter?: string;
  timeout_ms?: number;
  target_phone_number?: string;
  voice?: VoiceConfig;
}

export interface PresignResponse {
  upload_url: string;
  bundle_key: string;
}

export interface CreateRunRequest {
  source_type: SourceType;
  bundle_key: string;
  bundle_hash: string;
  mode?: RunMode;
}

export interface RunnerCallbackPayload {
  run_id: string;
  status: "pass" | "fail";
  scenario_results: ScenarioResultPayload[];
  aggregate: AggregateMetrics;
  error_text?: string;
}

export interface ScenarioResultPayload {
  name: string;
  status: ScenarioStatus;
  metrics: ScenarioMetrics;
  trace: TraceEntry[];
  trace_ref?: string;
}
