/**
 * Barge-in test — verifies the agent stops speaking when interrupted.
 *
 * Procedure:
 * 1. Send a prompt via TTS to trigger agent response
 * 2. Wait for agent to start responding (VAD detects speech)
 * 3. Send interruption audio mid-response
 * 4. Measure if/when agent stops speaking
 * 5. PASS if agent stops within threshold, FAIL otherwise
 */

import type { AudioChannel } from "@voiceci/adapters";
import type { AudioTestResult } from "@voiceci/shared";
import { synthesize } from "@voiceci/voice";
import { VoiceActivityDetector } from "@voiceci/voice";
import { waitForSpeech, collectForDuration } from "./helpers.js";
import { hasAudio } from "./signals.js";

const STOP_THRESHOLD_MS = 2000;
const PROMPT = "Tell me a long story about a brave explorer who traveled across seven continents.";
const INTERRUPTION = "Stop, I have a question.";

export async function runBargeInTest(
  channel: AudioChannel
): Promise<AudioTestResult> {
  const startTime = performance.now();

  // Step 1: Send prompt to trigger a long agent response
  const promptAudio = await synthesize(PROMPT);
  channel.sendAudio(promptAudio);

  // Step 2: Wait for agent to start speaking
  const { timedOut: noResponse } = await waitForSpeech(channel, 10000);
  if (noResponse) {
    return {
      test_name: "barge_in",
      status: "fail",
      metrics: { agent_responded: false, barge_in_handled: false },
      duration_ms: Math.round(performance.now() - startTime),
      error: "Agent did not respond to prompt",
    };
  }

  // Let agent speak for a bit (1 second) to ensure it's mid-response
  await collectForDuration(channel, 1000);

  // Step 3: Send interruption
  const interruptAudio = await synthesize(INTERRUPTION);
  const interruptTime = Date.now();
  channel.sendAudio(interruptAudio);

  // Step 4: Monitor if agent stops speaking
  const vad = new VoiceActivityDetector({ silenceThresholdMs: 500 });
  await vad.init();

  let agentStoppedAt: number | null = null;

  try {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, STOP_THRESHOLD_MS + 1000);

      const onAudio = (chunk: Buffer) => {
        const state = vad.process(chunk);
        if ((state === "silence" || state === "end_of_turn") && !hasAudio(chunk)) {
          if (agentStoppedAt === null) {
            agentStoppedAt = Date.now();
          }
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

  const stopLatencyMs = agentStoppedAt
    ? agentStoppedAt - interruptTime
    : STOP_THRESHOLD_MS + 1000;
  const bargeInHandled = stopLatencyMs <= STOP_THRESHOLD_MS;

  const durationMs = Math.round(performance.now() - startTime);

  return {
    test_name: "barge_in",
    status: bargeInHandled ? "pass" : "fail",
    metrics: {
      agent_responded: true,
      barge_in_handled: bargeInHandled,
      stop_latency_ms: Math.round(stopLatencyMs),
      threshold_ms: STOP_THRESHOLD_MS,
    },
    duration_ms: durationMs,
    ...(!bargeInHandled && {
      error: `Agent did not stop within ${STOP_THRESHOLD_MS}ms after interruption (took ${Math.round(stopLatencyMs)}ms)`,
    }),
  };
}
