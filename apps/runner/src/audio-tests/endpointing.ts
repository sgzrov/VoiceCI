/**
 * Endpointing Accuracy test — checks if the agent waits for the caller
 * to finish or prematurely responds during mid-sentence pauses.
 *
 * Procedure:
 * 1. Send partA of a sentence, then a silence pause, then partB
 * 2. Monitor for premature agent speech during the pause
 * 3. Run 3 trials with different phrases; majority vote determines pass/fail
 */

import type { AudioChannel } from "@voiceci/adapters";
import type { AudioTestResult, AudioTestThresholds } from "@voiceci/shared";
import { synthesize } from "@voiceci/voice";
import { waitForSpeech, collectUntilEndOfTurn } from "./helpers.js";
import { generateSilence } from "./signals.js";

const DEFAULT_PAUSE_DURATION_MS = 1500;
const DEFAULT_MIN_PASS_RATIO = 0.67;

const TEST_CASES = [
  {
    partA: "I'd like to book an appointment for",
    partB: "next Tuesday at 3 PM",
  },
  {
    partA: "My account number is",
    partB: "seven eight nine zero one two",
  },
  {
    partA: "I was calling because I wanted to ask about",
    partB: "your refund policy for online orders",
  },
];

interface TrialResult {
  premature: boolean;
  respondedAfter: boolean;
  responseTimeMs: number;
}

export async function runEndpointingTest(
  channel: AudioChannel,
  thresholds?: AudioTestThresholds,
): Promise<AudioTestResult> {
  const PAUSE_MS = thresholds?.endpointing?.pause_duration_ms ?? DEFAULT_PAUSE_DURATION_MS;
  const MIN_PASS_RATIO = thresholds?.endpointing?.min_pass_ratio ?? DEFAULT_MIN_PASS_RATIO;
  const startTime = performance.now();

  const results: TrialResult[] = [];

  for (const testCase of TEST_CASES) {
    // Synthesize both parts
    const partAAudio = await synthesize(testCase.partA);
    const pauseAudio = generateSilence(PAUSE_MS);
    const partBAudio = await synthesize(testCase.partB);

    // Step 1: Send partA
    channel.sendAudio(partAAudio);

    // Step 2: Send pause and monitor for premature speech
    channel.sendAudio(pauseAudio);
    const prematureCheck = await waitForSpeech(channel, PAUSE_MS + 500);
    const premature = !prematureCheck.timedOut;

    if (premature) {
      // Drain the premature response before next trial
      await collectUntilEndOfTurn(channel, { timeoutMs: 10000, silenceThresholdMs: 1500 });
    }

    // Step 3: Send partB
    const partBSendTime = Date.now();
    channel.sendAudio(partBAudio);

    // Wait for agent's actual response
    const responseCheck = await waitForSpeech(channel, 10000);
    const respondedAfter = !responseCheck.timedOut;
    const responseTimeMs = respondedAfter ? responseCheck.detectedAt - partBSendTime : 0;

    if (respondedAfter) {
      await collectUntilEndOfTurn(channel, { timeoutMs: 15000, silenceThresholdMs: 1500 });
    }

    results.push({ premature, respondedAfter, responseTimeMs });

    // Brief pause between trials
    channel.sendAudio(generateSilence(300));
    await new Promise((r) => setTimeout(r, 300));
  }

  // Evaluate: trial passes if NOT premature
  const trialsPassed = results.filter((r) => !r.premature).length;
  const prematureCount = results.filter((r) => r.premature).length;
  const passRatio = trialsPassed / results.length;
  const passed = passRatio >= MIN_PASS_RATIO;

  const respondedResults = results.filter((r) => r.respondedAfter && r.responseTimeMs > 0);
  const meanResponseTime =
    respondedResults.length > 0
      ? Math.round(respondedResults.reduce((a, r) => a + r.responseTimeMs, 0) / respondedResults.length)
      : 0;

  const durationMs = Math.round(performance.now() - startTime);

  return {
    test_name: "endpointing",
    status: passed ? "pass" : "fail",
    metrics: {
      trials_total: results.length,
      trials_passed: trialsPassed,
      premature_responses: prematureCount,
      pause_duration_ms: PAUSE_MS,
      mean_response_time_ms: meanResponseTime,
    },
    duration_ms: durationMs,
    ...(!passed && {
      error: `Agent prematurely responded in ${prematureCount}/${results.length} trials (pass ratio ${passRatio.toFixed(2)} < ${MIN_PASS_RATIO})`,
    }),
  };
}
