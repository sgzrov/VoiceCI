/**
 * WebSocket Audio Channel
 *
 * Raw bidirectional PCM audio over WebSocket.
 * Extracted from ws-voice-adapter.ts — no TTS/STT/silence logic.
 */

import WebSocket from "ws";
import { BaseAudioChannel } from "./audio-channel.js";

export interface WsAudioChannelConfig {
  wsUrl: string;
}

export class WsAudioChannel extends BaseAudioChannel {
  private ws: WebSocket | null = null;
  private config: WsAudioChannelConfig;

  constructor(config: WsAudioChannelConfig) {
    super();
    this.config = config;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.config.wsUrl);
      ws.binaryType = "nodebuffer";

      ws.on("open", () => {
        this.ws = ws;

        ws.on("message", (data: WebSocket.RawData) => {
          const chunk =
            data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
          this.emit("audio", chunk);
        });

        ws.on("error", (err) => {
          this.emit("error", err);
        });

        ws.on("close", () => {
          this.ws = null;
          this.emit("disconnected");
        });

        resolve();
      });

      ws.on("error", (err) => {
        reject(new Error(`WebSocket connection failed: ${err.message}`));
      });
    });
  }

  sendAudio(pcm: Buffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }
    this.ws.send(pcm);
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
