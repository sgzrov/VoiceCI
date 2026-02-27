/**
 * Per-WebSocket connection state.
 *
 * Each VoiceCI test creates its own WS connection (see executor.ts:68,85).
 * This class provides per-connection isolation — no cross-talk between
 * concurrent tests.
 */

import type WebSocket from "ws";
import type { ToolCallEvent, AudioHandler, AudioHandlerContext } from "./types.js";

export class VoiceCIConnection {
  private ws: WebSocket;
  private handler: AudioHandler;

  constructor(ws: WebSocket, handler: AudioHandler) {
    this.ws = ws;
    this.handler = handler;
    this.setup();
  }

  private setup(): void {
    this.ws.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) {
        const buf =
          data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
        this.handleAudio(buf);
      }
      // Text frames from VoiceCI are ignored — the runner only sends binary audio
    });
  }

  private async handleAudio(pcm: Buffer): Promise<void> {
    const ctx: AudioHandlerContext = {
      reportToolCall: (call) => this.sendToolCall(call),
      sendAudio: (audio) => this.sendAudioFrame(audio),
    };

    try {
      const result = await this.handler(pcm, ctx);
      if (result?.audio && result.audio.length > 0) {
        this.sendAudioFrame(result.audio);
      }
    } catch (err) {
      console.error("[voiceci-sdk] onAudio handler error:", err);
    }
  }

  private sendAudioFrame(pcm: Buffer): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(pcm);
    }
  }

  private sendToolCall(call: Omit<ToolCallEvent, "type">): void {
    if (this.ws.readyState === this.ws.OPEN) {
      const event: ToolCallEvent = { type: "tool_call", ...call };
      this.ws.send(JSON.stringify(event));
    }
  }
}
