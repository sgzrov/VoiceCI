/**
 * Audio test dispatcher — maps test names to executor functions.
 */

import type { AudioChannel } from "@voiceci/adapters";
import type { AudioTestName, AudioTestResult, AudioTestThresholds } from "@voiceci/shared";
import { runEchoTest } from "./echo.js";
import { runBargeInTest } from "./barge-in.js";
import { runTtfbTest } from "./ttfb.js";
import { runSilenceHandlingTest } from "./silence.js";
import { runConnectionStabilityTest } from "./connection.js";
import { runCompletenessTest } from "./completeness.js";
import { runNoiseResilienceTest } from "./noise-resilience.js";
import { runEndpointingTest } from "./endpointing.js";
import { runAudioQualityTest } from "./audio-quality.js";

type AudioTestExecutor = (channel: AudioChannel, thresholds?: AudioTestThresholds) => Promise<AudioTestResult>;

const EXECUTORS: Record<AudioTestName, AudioTestExecutor> = {
  echo: runEchoTest,
  barge_in: runBargeInTest,
  ttfb: runTtfbTest,
  silence_handling: runSilenceHandlingTest,
  connection_stability: runConnectionStabilityTest,
  response_completeness: runCompletenessTest,
  noise_resilience: runNoiseResilienceTest,
  endpointing: runEndpointingTest,
  audio_quality: runAudioQualityTest,
};

/**
 * Run a single audio test by name against a connected AudioChannel.
 */
export async function runAudioTest(
  testName: AudioTestName,
  channel: AudioChannel,
  thresholds?: AudioTestThresholds,
): Promise<AudioTestResult> {
  const executor = EXECUTORS[testName];

  try {
    return await executor(channel, thresholds);
  } catch (err) {
    return {
      test_name: testName,
      status: "fail",
      metrics: {},
      duration_ms: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
