/**
 * Echo test — detects pipeline feedback loops where the agent's STT
 * picks up its own TTS output and responds to itself.
 *
 * The bug: agent speaks → its own audio gets transcribed by STT → fed
 * back as user input → agent responds to its own words → loop.
 *
 * Detection: two-channel VAD + loop counting.
 * We control the caller channel (we know when we're silent).
 * We observe the agent channel via VAD.
 * After our prompt, we go silent and count how many times the agent
 * speaks unprompted. A single response could be "are you still there?"
 * but 2+ unprompted responses is a feedback loop.
 */

import type { AudioChannel } from "@voiceci/adapters";
import type { AudioTestResult } from "@voiceci/shared";
import { synthesize } from "@voiceci/voice";
import { collectUntilEndOfTurn, waitForSpeech } from "./helpers.js";

const PROMPT = "Hi, can you tell me about your services?";
const ECHO_WINDOW_MS = 3000;
const MAX_DETECTION_MS = 15000;
const LOOP_THRESHOLD = 2;

export async function runEchoTest(
  channel: AudioChannel
): Promise<AudioTestResult> {
  const startTime = performance.now();

  // Phase 1: Send a real prompt and collect the agent's first response
  const promptAudio = await synthesize(PROMPT);
  channel.sendAudio(promptAudio);

  await collectUntilEndOfTurn(channel, { timeoutMs: 15000 });

  // Phase 2: Go silent — count unprompted agent responses
  const silenceStart = Date.now();
  let unpromptedCount = 0;
  let firstResponseDelayMs = 0;

  while (Date.now() - silenceStart < MAX_DETECTION_MS) {
    const { detectedAt, timedOut } = await waitForSpeech(
      channel,
      ECHO_WINDOW_MS
    );

    if (timedOut) break;

    unpromptedCount++;
    if (unpromptedCount === 1) {
      firstResponseDelayMs = detectedAt - silenceStart;
    }

    // Drain the utterance so we can wait for the next one
    await collectUntilEndOfTurn(channel, { timeoutMs: 10000 });
  }

  const echoDetected = unpromptedCount >= LOOP_THRESHOLD;
  const durationMs = Math.round(performance.now() - startTime);

  return {
    test_name: "echo",
    status: echoDetected ? "fail" : "pass",
    metrics: {
      echo_detected: echoDetected,
      unprompted_count: unpromptedCount,
      first_response_delay_ms: firstResponseDelayMs,
    },
    duration_ms: durationMs,
    ...(echoDetected && {
      error: `Pipeline echo loop detected: agent responded ${unpromptedCount} times unprompted after going silent`,
    }),
  };
}
