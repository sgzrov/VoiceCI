/**
 * Bland AI Audio Channel
 *
 * Creates an outbound call via Bland's API and pulls tool call data
 * after the call via GET /v1/calls/{id}.
 *
 * Bland handles calls over the phone network — there is no direct
 * WebSocket audio exchange. VoiceCI sends audio via TTS to the caller
 * prompt and Bland's agent responds over the phone.
 *
 * For tool call data: Bland logs tool invocations as "agent-action"
 * entries in transcripts, plus stores results in the variables object.
 */

import type { ObservedToolCall } from "@voiceci/shared";
import { BaseAudioChannel } from "./audio-channel.js";

export interface BlandAudioChannelConfig {
  apiKey: string;
  phoneNumber: string;
  fromNumber?: string;
  task?: string;
  pathwayId?: string;
}

interface BlandCreateCallResponse {
  call_id: string;
  status: string;
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

export class BlandAudioChannel extends BaseAudioChannel {
  private config: BlandAudioChannelConfig;
  private callId: string | null = null;
  private _connected = false;

  constructor(config: BlandAudioChannelConfig) {
    super();
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    const body: Record<string, unknown> = {
      phone_number: this.config.phoneNumber,
    };
    if (this.config.fromNumber) body.from = this.config.fromNumber;
    if (this.config.task) body.task = this.config.task;
    if (this.config.pathwayId) body.pathway_id = this.config.pathwayId;

    const res = await fetch("https://api.bland.ai/v1/calls", {
      method: "POST",
      headers: {
        Authorization: this.config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Bland call creation failed (${res.status}): ${errorText}`);
    }

    const data = (await res.json()) as BlandCreateCallResponse;
    this.callId = data.call_id;
    this._connected = true;

    console.log(`Bland call created: ${this.callId}`);
  }

  sendAudio(_pcm: Buffer): void {
    // Bland handles audio over the phone network.
    // Audio is sent through TTS on Bland's side based on the task/pathway.
    // This is a no-op for phone-based calls.
  }

  async disconnect(): Promise<void> {
    if (this.callId) {
      // End the call via Bland API
      await fetch(`https://api.bland.ai/v1/calls/${this.callId}/stop`, {
        method: "POST",
        headers: { Authorization: this.config.apiKey },
      }).catch(() => {});
    }
    this._connected = false;
  }

  async getCallData(): Promise<ObservedToolCall[]> {
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
