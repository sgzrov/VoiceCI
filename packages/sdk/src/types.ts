/**
 * VoiceCI SDK Types
 *
 * Protocol types match WsToolCallEvent from
 * packages/adapters/src/ws-audio-channel.ts:19-26
 */

export interface ToolCallEvent {
  type: "tool_call";
  name: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
  successful?: boolean;
  duration_ms?: number;
}

export interface AudioHandlerResult {
  /** PCM 16-bit 24kHz mono */
  audio: Buffer;
}

export interface AudioHandlerContext {
  /** Report a tool call to VoiceCI for evaluation */
  reportToolCall: (call: Omit<ToolCallEvent, "type">) => void;
  /** Send audio back to VoiceCI mid-handler (for streaming responses) */
  sendAudio: (pcm: Buffer) => void;
}

export type AudioHandler = (
  audio: Buffer,
  ctx: AudioHandlerContext,
) => Promise<AudioHandlerResult | void>;

export interface VoiceCIServerConfig {
  /** Port to listen on (default: 3001) */
  port?: number;
  /** Health check path (default: "/health") */
  healthPath?: string;
  /** Handler called for each audio chunk received from VoiceCI */
  onAudio: AudioHandler;
}
