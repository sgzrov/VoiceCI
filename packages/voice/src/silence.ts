/**
 * Silence detection for PCM 16-bit audio.
 * Determines when an agent has stopped speaking by detecting sustained silence.
 */

import { BYTES_PER_SECOND } from "./types.js";

export interface SilenceDetectorConfig {
  /** How long silence must last to trigger end-of-turn (ms). Default: 1500 */
  silenceThresholdMs?: number;
  /** Amplitude below which a sample is considered silent. Default: 500 (int16 range: -32768 to 32767) */
  amplitudeThreshold?: number;
}

export class SilenceDetector {
  private silenceThresholdMs: number;
  private amplitudeThreshold: number;
  private silenceStartMs: number | null = null;
  private totalBytesProcessed = 0;

  constructor(config?: SilenceDetectorConfig) {
    this.silenceThresholdMs = config?.silenceThresholdMs ?? 1500;
    this.amplitudeThreshold = config?.amplitudeThreshold ?? 500;
  }

  /**
   * Process an incoming PCM chunk.
   * Returns true if sustained silence has been detected (end-of-turn).
   */
  process(chunk: Buffer): boolean {
    const isSilent = this.isChunkSilent(chunk);
    const currentMs =
      (this.totalBytesProcessed / BYTES_PER_SECOND) * 1000;

    this.totalBytesProcessed += chunk.length;

    if (isSilent) {
      if (this.silenceStartMs === null) {
        this.silenceStartMs = currentMs;
      }
      const silenceDuration = currentMs - this.silenceStartMs;
      return silenceDuration >= this.silenceThresholdMs;
    } else {
      this.silenceStartMs = null;
      return false;
    }
  }

  reset(): void {
    this.silenceStartMs = null;
    this.totalBytesProcessed = 0;
  }

  private isChunkSilent(chunk: Buffer): boolean {
    // PCM 16-bit: each sample is 2 bytes, little-endian signed int16
    for (let i = 0; i < chunk.length - 1; i += 2) {
      const sample = chunk.readInt16LE(i);
      if (Math.abs(sample) > this.amplitudeThreshold) {
        return false;
      }
    }
    return true;
  }
}
