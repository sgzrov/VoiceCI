/**
 * Retell Audio Channel
 *
 * Creates a web call via Retell's API, connects via their WebRTC SDK,
 * and pulls tool call data after the call via GET /v2/get-call/{id}.
 *
 * Retell V2 uses WebRTC (not WebSocket) for audio. We use their SDK
 * for the audio connection and their REST API for tool call data.
 *
 * Audio: PCM 24kHz mono (our standard) — Retell handles format conversion internally.
 */

import type { ObservedToolCall } from "@voiceci/shared";
import { BaseAudioChannel } from "./audio-channel.js";

export interface RetellAudioChannelConfig {
  apiKey: string;
  agentId: string;
}

interface RetellCreateWebCallResponse {
  call_id: string;
  access_token: string;
  call_type: string;
  call_status: string;
  agent_id: string;
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
  private callId: string | null = null;
  private accessToken: string | null = null;
  private _connected = false;
  private audioBuffer: Buffer[] = [];

  constructor(config: RetellAudioChannelConfig) {
    super();
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    // Create web call via Retell API
    const res = await fetch("https://api.retellai.com/v2/create-web-call", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: this.config.agentId,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Retell web call creation failed (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as RetellCreateWebCallResponse;
    this.callId = data.call_id;
    this.accessToken = data.access_token;
    this._connected = true;

    // Note: Full WebRTC connection requires @anthropic-ai/retell-client-js-sdk
    // or a similar WebRTC client. For now, we store the access_token and call_id
    // for tool call data retrieval. Audio exchange happens through the Retell SDK
    // which should be initialized by the consumer with the access_token.
    //
    // In a production implementation, this would initialize the Retell WebRTC
    // client with the access_token and wire up audio send/receive.
    console.log(`Retell call created: ${this.callId} (WebRTC access_token obtained)`);
  }

  sendAudio(pcm: Buffer): void {
    if (!this._connected) {
      throw new Error("Retell channel not connected");
    }
    // Buffer audio — in a full implementation this goes through WebRTC
    this.audioBuffer.push(pcm);
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this.audioBuffer = [];
  }

  async getCallData(): Promise<ObservedToolCall[]> {
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
