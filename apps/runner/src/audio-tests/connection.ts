/**
 * Connection stability test — verifies the channel survives multi-turn exchange.
 *
 * Procedure:
 * 1. Run multiple conversational turns with canned prompts
 * 2. Verify channel stays connected throughout
 * 3. Measure any dropped audio or disconnections
 */

import type { AudioChannel } from "@voiceci/adapters";
import type { AudioTestResult } from "@voiceci/shared";
import { synthesize } from "@voiceci/voice";
import { waitForSpeech, collectUntilEndOfTurn } from "./helpers.js";

const CANNED_PROMPTS = [
  "Hello, how can you help me today?",
  "That sounds great, tell me more.",
  "Interesting. What about alternatives?",
  "Can you summarize everything we discussed?",
  "Thank you, goodbye.",
];

export async function runConnectionStabilityTest(
  channel: AudioChannel
): Promise<AudioTestResult> {
  const startTime = performance.now();
  let completedTurns = 0;
  let disconnected = false;

  for (const prompt of CANNED_PROMPTS) {
    if (!channel.connected) {
      disconnected = true;
      break;
    }

    // Send prompt
    const audio = await synthesize(prompt);
    channel.sendAudio(audio);

    // Wait for agent response
    const { timedOut } = await waitForSpeech(channel, 10000);
    if (timedOut) {
      // Agent didn't respond — might still be connected though
      break;
    }

    // Drain the full response
    await collectUntilEndOfTurn(channel, {
      timeoutMs: 15000,
      silenceThresholdMs: 1500,
    });

    completedTurns++;
  }

  const stillConnected = channel.connected;
  const allTurnsCompleted = completedTurns === CANNED_PROMPTS.length;
  const passed = stillConnected && !disconnected && allTurnsCompleted;

  const durationMs = Math.round(performance.now() - startTime);

  return {
    test_name: "connection_stability",
    status: passed ? "pass" : "fail",
    metrics: {
      total_turns: CANNED_PROMPTS.length,
      completed_turns: completedTurns,
      still_connected: stillConnected,
      disconnected_mid_test: disconnected,
    },
    duration_ms: durationMs,
    ...(!passed && {
      error: disconnected
        ? `Channel disconnected after ${completedTurns} turns`
        : !allTurnsCompleted
          ? `Only ${completedTurns}/${CANNED_PROMPTS.length} turns completed`
          : "Channel lost after completing turns",
    }),
  };
}
