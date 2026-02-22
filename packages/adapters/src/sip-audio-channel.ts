/**
 * SIP/Phone Audio Channel (Plivo Audio Streams)
 *
 * Places an outbound call via Plivo, streams bidirectional audio
 * through Plivo Audio Streams over WebSocket. Handles PCM 24kHz
 * <-> mulaw 8kHz conversion internally.
 *
 * Extracted from sip-voice-adapter.ts — no TTS/STT/silence logic.
 */

import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import { pcmToMulaw, mulawToPcm, resample } from "@voiceci/voice";
import { BaseAudioChannel } from "./audio-channel.js";

export interface SipAudioChannelConfig {
  phoneNumber: string;
  fromNumber: string;
  authId: string;
  authToken: string;
  publicHost: string;
}

interface PlivoStreamMessage {
  event: string;
  start?: { streamId: string; callId: string };
}

export class SipAudioChannel extends BaseAudioChannel {
  private config: SipAudioChannelConfig;
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private mediaWs: WebSocket | null = null;
  private streamId: string | null = null;
  private port = 0;
  private callUuid: string | null = null;

  constructor(config: SipAudioChannelConfig) {
    super();
    this.config = config;
  }

  get connected(): boolean {
    return this.mediaWs !== null;
  }

  async connect(): Promise<void> {
    await this.startServer();

    const answerUrl = `https://${this.config.publicHost}:${this.port}/answer`;

    const authHeader = Buffer.from(
      `${this.config.authId}:${this.config.authToken}`
    ).toString("base64");

    const res = await fetch(
      `https://api.plivo.com/v1/Account/${this.config.authId}/Call/`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${authHeader}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: this.config.phoneNumber,
          from: this.config.fromNumber,
          answer_url: answerUrl,
          answer_method: "GET",
        }),
      }
    );

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(
        `Plivo call creation failed (${res.status}): ${errorText}`
      );
    }

    const callData = (await res.json()) as { request_uuid: string };
    this.callUuid = callData.request_uuid;

    await this.waitForMediaConnection();
  }

  sendAudio(pcm: Buffer): void {
    if (!this.mediaWs) {
      throw new Error("SIP media stream not connected");
    }

    // PCM 24kHz → 8kHz → mulaw → base64 JSON events
    const pcm8k = resample(pcm, 24000, 8000);
    const mulaw = pcmToMulaw(pcm8k);

    const CHUNK_SIZE = 160; // 20ms at 8kHz mulaw
    for (let offset = 0; offset < mulaw.length; offset += CHUNK_SIZE) {
      const chunk = mulaw.subarray(
        offset,
        Math.min(offset + CHUNK_SIZE, mulaw.length)
      );
      const msg = JSON.stringify({
        event: "playAudio",
        media: {
          contentType: "audio/x-mulaw",
          sampleRate: "8000",
          payload: chunk.toString("base64"),
        },
      });
      this.mediaWs.send(msg);
    }
  }

  async disconnect(): Promise<void> {
    if (this.callUuid) {
      const authHeader = Buffer.from(
        `${this.config.authId}:${this.config.authToken}`
      ).toString("base64");

      await fetch(
        `https://api.plivo.com/v1/Account/${this.config.authId}/Call/${this.callUuid}/`,
        {
          method: "DELETE",
          headers: { Authorization: `Basic ${authHeader}` },
        }
      ).catch(() => {});

      this.callUuid = null;
    }

    if (this.mediaWs) {
      this.mediaWs.close();
      this.mediaWs = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private async startServer(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        if (req.url?.startsWith("/answer")) {
          const wsUrl = `wss://${this.config.publicHost}:${this.port}/stream`;
          const xml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            "<Response>",
            `  <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-mulaw;rate=8000">${wsUrl}</Stream>`,
            "</Response>",
          ].join("\n");

          res.writeHead(200, { "Content-Type": "application/xml" });
          res.end(xml);
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      this.wss = new WebSocketServer({ server: this.server });

      this.wss.on("connection", (ws) => {
        this.mediaWs = ws;

        ws.on("message", (data) => {
          let buf: Buffer;
          if (Buffer.isBuffer(data)) {
            buf = data;
          } else if (data instanceof ArrayBuffer) {
            buf = Buffer.from(new Uint8Array(data));
          } else {
            buf = Buffer.concat(data as Buffer[]);
          }

          // JSON control messages (start/stop events)
          if (buf[0] === 0x7b) {
            try {
              const msg = JSON.parse(buf.toString()) as PlivoStreamMessage;
              if (msg.event === "start" && msg.start?.streamId) {
                this.streamId = msg.start.streamId;
              }
            } catch {
              // Ignore
            }
            return;
          }

          // Raw mulaw audio → PCM 24kHz
          const pcm8k = mulawToPcm(buf);
          const pcm24k = resample(pcm8k, 8000, 24000);
          this.emit("audio", pcm24k);
        });

        ws.on("close", () => {
          this.mediaWs = null;
          this.emit("disconnected");
        });

        ws.on("error", (err) => {
          this.emit("error", err);
        });
      });

      this.server.listen(0, () => {
        const addr = this.server!.address();
        if (addr && typeof addr !== "string") {
          this.port = addr.port;
        }
        resolve();
      });
    });
  }

  private async waitForMediaConnection(): Promise<void> {
    const maxWait = 30_000;
    const start = Date.now();

    while (!this.mediaWs && Date.now() - start < maxWait) {
      await sleep(500);
    }

    if (!this.mediaWs) {
      throw new Error("Plivo media stream connection timed out");
    }

    while (!this.streamId && Date.now() - start < maxWait) {
      await sleep(200);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
