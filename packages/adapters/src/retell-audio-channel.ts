/**
 * Retell Audio Channel
 *
 * Composes a SipAudioChannel for bidirectional audio (Plivo phone call)
 * with Retell's REST API for post-call tool call extraction.
 *
 * Flow:
 *   1. connect()  — dials the Retell agent's phone number via SIP/Plivo
 *   2. sendAudio() / on("audio") — bidirectional PCM 24kHz over SIP
 *   3. disconnect() — hangs up the SIP call
 *   4. getCallData() — resolves Retell call_id via list-calls API,
 *      then fetches tool call data from GET /v2/get-call/{id}
 */

import type { ObservedToolCall } from "@voiceci/shared";
import { BaseAudioChannel } from "./audio-channel.js";
import { SipAudioChannel, type SipAudioChannelConfig } from "./sip-audio-channel.js";

export interface RetellAudioChannelConfig {
  apiKey: string;
  agentId: string;
  sip: SipAudioChannelConfig;
}

interface RetellToolCallInvocation {
  role: "tool_call_invocation";
  tool_call_id: string;
  name: string;
  arguments: string;
}

interface RetellToolCallResult {
  role: "tool_call_result";
  tool_call_id: string;
  content: string;
  successful: boolean;
}

interface RetellUtterance {
  role: "agent" | "user";
  content: string;
  words?: Array<{ word: string; start: number; end: number }>;
}

type RetellTranscriptEntry =
  | RetellUtterance
  | RetellToolCallInvocation
  | RetellToolCallResult;

interface RetellCallResponse {
  call_id: string;
  call_status: string;
  transcript_with_tool_calls?: RetellTranscriptEntry[];
  start_timestamp?: number;
  end_timestamp?: number;
}

export class RetellAudioChannel extends BaseAudioChannel {
  private config: RetellAudioChannelConfig;
  private sipChannel: SipAudioChannel | null = null;
  private callId: string | null = null;
  private callStartTimestamp = 0;

  constructor(config: RetellAudioChannelConfig) {
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
      throw new Error("Retell channel not connected");
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

    // Wait for Retell to process the call data
    await sleep(2000);

    const res = await fetch(`https://api.retellai.com/v2/get-call/${this.callId}`, {
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
    });

    if (!res.ok) return [];

    const data = (await res.json()) as RetellCallResponse;
    return this.parseToolCalls(data);
  }

  private async resolveCallId(): Promise<string | null> {
    // Wait for Retell to ingest the call
    await sleep(3000);

    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch("https://api.retellai.com/v2/list-calls", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filter_criteria: {
              agent_id: [this.config.agentId],
              to_number: [this.config.sip.phoneNumber],
              from_number: [this.config.sip.fromNumber],
              call_type: ["phone_call"],
              start_timestamp: {
                lower_threshold: this.callStartTimestamp - 30_000,
              },
            },
            sort_order: "descending",
            limit: 1,
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as RetellCallResponse[];
          if (data.length > 0) {
            return data[0].call_id;
          }
        }
      } catch {
        // Retry on network errors
      }

      if (attempt < maxAttempts - 1) {
        await sleep(2000 * (attempt + 1));
      }
    }

    console.warn("Retell: could not resolve call_id from list-calls API");
    return null;
  }

  private parseToolCalls(data: RetellCallResponse): ObservedToolCall[] {
    const entries = data.transcript_with_tool_calls ?? [];
    const toolCalls: ObservedToolCall[] = [];

    // Build a map of results keyed by tool_call_id
    const resultMap = new Map<string, RetellToolCallResult>();
    for (const entry of entries) {
      if (entry.role === "tool_call_result") {
        resultMap.set(entry.tool_call_id, entry);
      }
    }

    for (const entry of entries) {
      if (entry.role === "tool_call_invocation") {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(entry.arguments) as Record<string, unknown>;
        } catch {
          // keep empty
        }

        const result = resultMap.get(entry.tool_call_id);
        let parsedResult: unknown;
        if (result) {
          try {
            parsedResult = JSON.parse(result.content);
          } catch {
            parsedResult = result.content;
          }
        }

        toolCalls.push({
          name: entry.name,
          arguments: args,
          result: parsedResult,
          successful: result?.successful,
        });
      }
    }

    return toolCalls;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
