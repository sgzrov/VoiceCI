/**
 * SIP/Phone Voice Adapter (Plivo Audio Streams)
 *
 * For testing voice agents deployed with phone numbers.
 * Places an outbound call via Plivo, streams bidirectional audio
 * through Plivo Audio Streams over WebSocket.
 */

import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import {
  synthesize,
  transcribe,
  SilenceDetector,
  AudioRecorder,
  pcmToMulaw,
  mulawToPcm,
  resample,
  type TTSConfig,
  type STTConfig,
} from "@voiceci/voice";
import type { AgentAdapter, AgentResponse } from "./types.js";

export interface SipVoiceAdapterConfig {
  phoneNumber: string;
  fromNumber: string;
  authId: string;
  authToken: string;
  publicHost: string;
  tts?: TTSConfig;
  stt?: STTConfig;
  silenceThresholdMs?: number;
}

export class SipVoiceAdapter implements AgentAdapter {
  private config: SipVoiceAdapterConfig;
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private mediaWs: WebSocket | null = null;
  private streamId: string | null = null;
  private port = 0;
  private callUuid: string | null = null;

  constructor(config: SipVoiceAdapterConfig) {
    this.config = config;
  }

  async sendMessage(text: string): Promise<AgentResponse> {
    // Ensure the call is established
    if (!this.mediaWs) {
      await this.initCall();
    }

    const mediaWs = this.mediaWs!;

    // 1. TTS: text → PCM 24kHz → resample to 8kHz → encode mulaw
    const pcm24k = await synthesize(text, this.config.tts);
    const pcm8k = resample(pcm24k, 24000, 8000);
    const mulaw = pcmToMulaw(pcm8k);

    // 2. Set up audio collection
    const recorder = new AudioRecorder();
    const silenceDetector = new SilenceDetector({
      silenceThresholdMs: this.config.silenceThresholdMs ?? 1500,
    });

    const responsePromise = new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), 30_000);

      const onMessage = (data: Buffer | ArrayBuffer | Buffer[]) => {
        // Plivo sends incoming audio as raw binary mulaw frames
        let buf: Buffer;
        if (Buffer.isBuffer(data)) {
          buf = data;
        } else if (data instanceof ArrayBuffer) {
          buf = Buffer.from(new Uint8Array(data));
        } else {
          buf = Buffer.concat(data);
        }

        // Skip JSON control messages (start/stop events)
        if (buf[0] === 0x7b) {
          // '{' character — JSON message, not audio
          return;
        }

        // Raw mulaw audio → PCM
        const pcmChunk8k = mulawToPcm(buf);
        const pcmChunk24k = resample(pcmChunk8k, 8000, 24000);

        recorder.push(pcmChunk24k);
        if (silenceDetector.process(pcmChunk24k)) {
          cleanup();
          resolve();
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        mediaWs.off("message", onMessage);
      };

      mediaWs.on("message", onMessage);
    });

    // 3. Send audio to Plivo via playAudio event (base64 mulaw chunks)
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
      mediaWs.send(msg);
      await sleep(20); // 20ms pacing for real-time
    }

    // 4. Wait for response
    await responsePromise;

    // 5. STT
    const audioBuffer = recorder.getBuffer();
    let responseText = "";
    let confidence = 0;

    if (audioBuffer.length > 0) {
      const result = await transcribe(audioBuffer, this.config.stt);
      responseText = result.text;
      confidence = result.confidence;
    }

    return {
      text: responseText,
      latency_ms: recorder.getTimeToFirstByteMs() ?? 0,
      audio: audioBuffer,
      audio_duration_ms: recorder.getDurationMs(),
      stt_confidence: confidence,
      time_to_first_byte_ms: recorder.getTimeToFirstByteMs() ?? undefined,
    };
  }

  private async initCall(): Promise<void> {
    // Start local server for Plivo Audio Streams
    await this.startServer();

    // Plivo requires an answer_url that returns XML.
    // Our local HTTP server serves the Stream XML at /answer.
    const answerUrl = `https://${this.config.publicHost}:${this.port}/answer`;

    // Create outbound call via Plivo REST API
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

    // Wait for Plivo to connect the media stream
    await this.waitForMediaConnection();
  }

  private async startServer(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        // Serve the Stream XML when Plivo hits the answer URL
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
          // Parse JSON control messages to extract streamId
          if (!Buffer.isBuffer(data)) return;
          const buf = data;
          if (buf[0] !== 0x7b) return; // Not JSON

          try {
            const msg = JSON.parse(buf.toString()) as PlivoStreamMessage;
            if (msg.event === "start" && msg.start?.streamId) {
              this.streamId = msg.start.streamId;
            }
          } catch {
            // Ignore
          }
        });
      });

      // Listen on a random available port
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

    // Wait for stream start event
    while (!this.streamId && Date.now() - start < maxWait) {
      await sleep(200);
    }
  }

  async disconnect(): Promise<void> {
    // Hang up the call
    if (this.callUuid) {
      const authHeader = Buffer.from(
        `${this.config.authId}:${this.config.authToken}`
      ).toString("base64");

      await fetch(
        `https://api.plivo.com/v1/Account/${this.config.authId}/Call/${this.callUuid}/`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Basic ${authHeader}`,
          },
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
}

interface PlivoStreamMessage {
  event: string;
  start?: { streamId: string; callId: string };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
