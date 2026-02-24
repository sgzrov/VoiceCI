/**
 * Bland AI Audio Channel
 *
 * Composes a SipAudioChannel for bidirectional audio (Plivo phone call)
 * with Bland's REST API for post-call tool call extraction.
 *
 * Flow:
 *   1. connect()  — dials the Bland agent's phone number via SIP/Plivo
 *   2. sendAudio() / on("audio") — bidirectional PCM 24kHz over SIP
 *   3. disconnect() — hangs up the SIP call
 *   4. getCallData() — resolves Bland call_id via list calls API,
 *      then fetches tool call data from GET /v1/calls/{id}
 */

import type { ObservedToolCall } from "@voiceci/shared";
import { BaseAudioChannel } from "./audio-channel.js";
import { SipAudioChannel, type SipAudioChannelConfig } from "./sip-audio-channel.js";

export interface BlandAudioChannelConfig {
  apiKey: string;
  phoneNumber: string;
  sip: SipAudioChannelConfig;
}

interface BlandTranscriptEntry {
  id: string;
  created_at: string;
  text: string;
  user: "user" | "assistant" | "robot" | "agent-action";
}

interface BlandCallResponse {
  call_id: string;
  status: string;
  transcripts?: BlandTranscriptEntry[];
  variables?: Record<string, unknown>;
  pathway_logs?: Array<{
    node_id?: string;
    text?: string;
    data?: Record<string, unknown>;
  }>;
  call_length?: number;
}

interface BlandListCallsResponse {
  calls?: Array<{ call_id: string; created_at: string }>;
}

export class BlandAudioChannel extends BaseAudioChannel {
  private config: BlandAudioChannelConfig;
  private sipChannel: SipAudioChannel | null = null;
  private callId: string | null = null;
  private callStartTimestamp = 0;

  constructor(config: BlandAudioChannelConfig) {
    super();
    this.config = config;
  }

  get connected(): boolean {
    return this.sipChannel?.connected ?? false;
  }

  async connect(): Promise<void> {
    this.callStartTimestamp = Date.now();
    this.sipChannel = new SipAudioChannel(this.config.sip);

    this.sipChannel.on("audio", (chunk) => this.emit("audio", chunk));
    this.sipChannel.on("error", (err) => this.emit("error", err));
    this.sipChannel.on("disconnected", () => this.emit("disconnected"));

    await this.sipChannel.connect();
  }

  sendAudio(pcm: Buffer): void {
    if (!this.sipChannel) {
      throw new Error("Bland channel not connected");
    }
    this.sipChannel.sendAudio(pcm);
  }

  async disconnect(): Promise<void> {
    if (this.sipChannel) {
      await this.sipChannel.disconnect();
      this.sipChannel = null;
    }
  }

  async getCallData(): Promise<ObservedToolCall[]> {
    if (!this.callId) {
      this.callId = await this.resolveCallId();
    }
    if (!this.callId) return [];

    // Wait for Bland to process the call data
    await sleep(3000);

    const res = await fetch(`https://api.bland.ai/v1/calls/${this.callId}`, {
      headers: { Authorization: this.config.apiKey },
    });

    if (!res.ok) return [];

    const data = (await res.json()) as BlandCallResponse;
    return this.parseToolCalls(data);
  }

  private async resolveCallId(): Promise<string | null> {
    // Wait for Bland to ingest the call
    await sleep(3000);

    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const params = new URLSearchParams({
          to: this.config.phoneNumber,
          from: this.config.sip.fromNumber,
          limit: "1",
          ascending: "false",
        });

        const res = await fetch(`https://api.bland.ai/v1/calls?${params}`, {
          headers: { Authorization: this.config.apiKey },
        });

        if (res.ok) {
          const data = (await res.json()) as BlandListCallsResponse;
          const calls = data.calls ?? [];
          const match = calls.find(
            (c) => new Date(c.created_at).getTime() >= this.callStartTimestamp - 30_000
          );
          if (match) return match.call_id;
        }
      } catch {
        // Retry on network errors
      }

      if (attempt < maxAttempts - 1) {
        await sleep(2000 * (attempt + 1));
      }
    }

    console.warn("Bland: could not resolve call_id from list calls API");
    return null;
  }

  private parseToolCalls(data: BlandCallResponse): ObservedToolCall[] {
    const toolCalls: ObservedToolCall[] = [];

    // Extract tool calls from transcript entries with user type "agent-action"
    const transcripts = data.transcripts ?? [];
    for (const entry of transcripts) {
      if (entry.user === "agent-action") {
        // Bland agent-action entries contain tool invocation info in the text
        // Try to parse as JSON, fall back to using text as the tool name
        try {
          const parsed = JSON.parse(entry.text) as {
            name?: string;
            tool?: string;
            arguments?: Record<string, unknown>;
            result?: unknown;
          };
          toolCalls.push({
            name: parsed.name ?? parsed.tool ?? "unknown",
            arguments: parsed.arguments ?? {},
            result: parsed.result,
            timestamp_ms: new Date(entry.created_at).getTime(),
          });
        } catch {
          toolCalls.push({
            name: entry.text,
            arguments: {},
            timestamp_ms: new Date(entry.created_at).getTime(),
          });
        }
      }
    }

    // Also check pathway_logs for tool invocations
    const pathwayLogs = data.pathway_logs ?? [];
    for (const log of pathwayLogs) {
      if (log.data && (log.data.tool_name || log.data.function_name)) {
        const name = (log.data.tool_name ?? log.data.function_name) as string;
        toolCalls.push({
          name,
          arguments: (log.data.arguments ?? {}) as Record<string, unknown>,
          result: log.data.result,
        });
      }
    }

    return toolCalls;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
