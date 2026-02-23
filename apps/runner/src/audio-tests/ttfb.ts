/**
 * TTFB (Time To First Byte) test — measures agent response latency.
 *
 * Procedure:
 * 1. Send 5 short prompts via TTS
 * 2. For each prompt, measure time from end of send to first audio byte from agent
 * 3. Report p50 and p95 TTFB
 * 4. PASS if p95 < threshold, FAIL otherwise
 */

import type { AudioChannel } from "@voiceci/adapters";
import type { AudioTestResult, AudioTestThresholds } from "@voiceci/shared";
import { synthesize } from "@voiceci/voice";
import { waitForSpeech, collectUntilEndOfTurn } from "./helpers.js";

const DEFAULT_P95_THRESHOLD_MS = 3000;
const PROMPTS = [
  "Hello, how are you?",
  "What time is it?",
  "Can you help me?",
  "Tell me a joke.",
  "What's the weather?",
];

export async function runTtfbTest(
  channel: AudioChannel,
  thresholds?: AudioTestThresholds,
): Promise<AudioTestResult> {
  const P95_THRESHOLD_MS = thresholds?.ttfb?.p95_threshold_ms ?? DEFAULT_P95_THRESHOLD_MS;
  const startTime = performance.now();
  const ttfbValues: number[] = [];

  for (const prompt of PROMPTS) {
    // Synthesize and send the prompt
    const audio = await synthesize(prompt);
    const sendTime = Date.now();
    channel.sendAudio(audio);

    // Wait for first speech from agent
    const { detectedAt, timedOut } = await waitForSpeech(channel, 10000);

    if (!timedOut && detectedAt > 0) {
      ttfbValues.push(detectedAt - sendTime);
    }

    // Drain agent response before next prompt
    await collectUntilEndOfTurn(channel, {
      timeoutMs: 10000,
      silenceThresholdMs: 1000,
    });
  }

  if (ttfbValues.length === 0) {
    return {
      test_name: "ttfb",
      status: "fail",
      metrics: { responses_received: 0 },
      duration_ms: Math.round(performance.now() - startTime),
      error: "Agent did not respond to any prompts",
    };
  }

  // Sort for percentile calculations
  const sorted = [...ttfbValues].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)]!;
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
  const mean = Math.round(ttfbValues.reduce((a, b) => a + b, 0) / ttfbValues.length);

  const passed = p95 <= P95_THRESHOLD_MS;
  const durationMs = Math.round(performance.now() - startTime);

  return {
    test_name: "ttfb",
    status: passed ? "pass" : "fail",
    metrics: {
      responses_received: ttfbValues.length,
      mean_ttfb_ms: mean,
      p50_ttfb_ms: Math.round(p50),
      p95_ttfb_ms: Math.round(p95),
      threshold_ms: P95_THRESHOLD_MS,
    },
    duration_ms: durationMs,
    ...(!passed && {
      error: `p95 TTFB ${Math.round(p95)}ms exceeds threshold ${P95_THRESHOLD_MS}ms`,
    }),
  };
}
