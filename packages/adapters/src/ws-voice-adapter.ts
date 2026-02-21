/**
 * WebSocket Voice Adapter
 *
 * For custom voice agents that accept/return PCM audio over WebSocket
 * (e.g. agents using ElevenLabs + WebSocket in their codebase).
 */

import WebSocket from "ws";
import {
  synthesize,
  transcribe,
  SilenceDetector,
  AudioRecorder,
  BYTES_PER_SECOND,
  type TTSConfig,
  type STTConfig,
} from "@voiceci/voice";
import type { AgentAdapter, AgentResponse } from "./types.js";

export interface WsVoiceAdapterConfig {
  wsUrl: string;
  tts?: TTSConfig;
  stt?: STTConfig;
  silenceThresholdMs?: number;
  /** Chunk size in bytes when sending audio. Default: 4800 (100ms at 24kHz 16-bit mono) */
  chunkSize?: number;
}

export class WsVoiceAdapter implements AgentAdapter {
  private ws: WebSocket | null = null;
  private config: WsVoiceAdapterConfig;
  private chunkSize: number;

  constructor(config: WsVoiceAdapterConfig) {
    this.config = config;
    this.chunkSize = config.chunkSize ?? 4800;
  }

  async sendMessage(text: string): Promise<AgentResponse> {
    // 1. TTS: text → PCM audio
    const ttsAudio = await synthesize(text, this.config.tts);

    // 2. Connect to WS if needed
    const ws = await this.ensureConnection();

    // 3. Set up audio collection
    const recorder = new AudioRecorder();
    const silenceDetector = new SilenceDetector({
      silenceThresholdMs: this.config.silenceThresholdMs ?? 1500,
    });

    const responsePromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(); // Timeout = assume agent is done
      }, 30_000);

      const onMessage = (data: WebSocket.RawData) => {
        const chunk =
          data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
        recorder.push(chunk);

        if (silenceDetector.process(chunk)) {
          cleanup();
          resolve();
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        clearTimeout(timeout);
        ws.off("message", onMessage);
        ws.off("error", onError);
      };

      ws.on("message", onMessage);
      ws.on("error", onError);
    });

    // 4. Send TTS audio in chunks
    for (let offset = 0; offset < ttsAudio.length; offset += this.chunkSize) {
      const chunk = ttsAudio.subarray(
        offset,
        Math.min(offset + this.chunkSize, ttsAudio.length)
      );
      ws.send(chunk);
      // Pace sending to approximate real-time
      const chunkDurationMs =
        (chunk.length / BYTES_PER_SECOND) * 1000;
      await sleep(chunkDurationMs);
    }

    // 5. Wait for agent response
    await responsePromise;

    // 6. STT: collected audio → transcript
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

  private async ensureConnection(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return this.ws;
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.config.wsUrl);
      ws.binaryType = "nodebuffer";

      ws.on("open", () => {
        this.ws = ws;
        resolve(ws);
      });

      ws.on("error", (err) => {
        reject(new Error(`WebSocket connection failed: ${err.message}`));
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
