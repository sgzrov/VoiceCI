export interface AgentResponse {
  text: string;
  latency_ms: number;
  // Voice extensions (populated by voice adapters, undefined for HTTP)
  audio?: Buffer;
  audio_duration_ms?: number;
  stt_confidence?: number;
  time_to_first_byte_ms?: number;
}

export interface AgentAdapter {
  sendMessage(text: string): Promise<AgentResponse>;
}
