/**
 * Shared helpers for audio test executors.
 */

import type { AudioChannel } from "@voiceci/adapters";
import { VoiceActivityDetector, type VADState } from "@voiceci/voice";

/**
 * Collect audio from the channel until VAD detects end-of-turn or timeout.
 * Returns the concatenated PCM buffer of all received audio.
 */
export async function collectUntilEndOfTurn(
  channel: AudioChannel,
  opts: {
    timeoutMs?: number;
    silenceThresholdMs?: number;
  } = {}
): Promise<{ audio: Buffer; timedOut: boolean }> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const silenceThresholdMs = opts.silenceThresholdMs ?? 1500;

  const vad = new VoiceActivityDetector({ silenceThresholdMs });
  await vad.init();

  const chunks: Buffer[] = [];
  let timedOut = false;

  try {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        timedOut = true;
        resolve();
      }, timeoutMs);

      const onAudio = (chunk: Buffer) => {
        chunks.push(chunk);
        const state = vad.process(chunk);
        if (state === "end_of_turn") {
          clearTimeout(timeout);
          channel.off("audio", onAudio);
          resolve();
        }
      };

      channel.on("audio", onAudio);
    });
  } finally {
    vad.destroy();
  }

  return {
    audio: Buffer.concat(chunks),
    timedOut,
  };
}

/**
 * Collect audio from the channel for a fixed duration.
 */
export async function collectForDuration(
  channel: AudioChannel,
  durationMs: number
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      channel.off("audio", onAudio);
      resolve();
    }, durationMs);

    const onAudio = (chunk: Buffer) => {
      chunks.push(chunk);
    };

    channel.on("audio", onAudio);
  });

  return Buffer.concat(chunks);
}

/**
 * Wait until VAD detects the first speech in the channel audio,
 * or timeout. Returns the timestamp when speech was first detected.
 */
export async function waitForSpeech(
  channel: AudioChannel,
  timeoutMs = 10000
): Promise<{ detectedAt: number; timedOut: boolean }> {
  const vad = new VoiceActivityDetector({ silenceThresholdMs: 500 });
  await vad.init();

  let timedOut = false;
  let detectedAt = 0;

  try {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        timedOut = true;
        resolve();
      }, timeoutMs);

      const onAudio = (chunk: Buffer) => {
        const state = vad.process(chunk);
        if (state === "speech") {
          detectedAt = Date.now();
          clearTimeout(timeout);
          channel.off("audio", onAudio);
          resolve();
        }
      };

      channel.on("audio", onAudio);
    });
  } finally {
    vad.destroy();
  }

  return { detectedAt, timedOut };
}
