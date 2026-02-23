/**
 * Extracted test execution logic — can be called from the Fly Machine entrypoint
 * OR directly from the API process (for already-deployed agents).
 *
 * All tests run in parallel with a concurrency limiter.
 * Each test creates its own AudioChannel for isolation.
 */

import type {
  TestSpec,
  AudioTestResult,
  ConversationTestResult,
  RunAggregateV2,
  AudioTestThresholds,
} from "@voiceci/shared";
import { createAudioChannel, type AudioChannelConfig } from "@voiceci/adapters";
import { runAudioTest } from "./audio-tests/index.js";
import { runConversationTest } from "./conversation/index.js";

export interface ExecuteTestsOpts {
  testSpec: TestSpec;
  channelConfig: AudioChannelConfig;
  audioTestThresholds?: AudioTestThresholds;
  concurrencyLimit?: number;
  onTestComplete?: (result: AudioTestResult | ConversationTestResult) => void;
}

export interface ExecuteTestsResult {
  status: "pass" | "fail";
  audioResults: AudioTestResult[];
  conversationResults: ConversationTestResult[];
  aggregate: RunAggregateV2;
}

/**
 * Run a set of concurrency-limited tasks, returning results in completion order.
 */
async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function next(): Promise<void> {
    while (index < tasks.length) {
      const currentIndex = index++;
      results[currentIndex] = await tasks[currentIndex]!();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => next());
  await Promise.all(workers);
  return results;
}

export async function executeTests(opts: ExecuteTestsOpts): Promise<ExecuteTestsResult> {
  const {
    testSpec,
    channelConfig,
    audioTestThresholds,
    concurrencyLimit = channelConfig.adapter === "sip" ? 5 : 10,
    onTestComplete,
  } = opts;

  const audioTasks = (testSpec.audio_tests ?? []).map((testName) => async () => {
    console.log(`  Audio test: ${testName}`);
    const channel = createAudioChannel(channelConfig);
    try {
      await channel.connect();
      const result = await runAudioTest(testName, channel, audioTestThresholds);
      console.log(`    ${testName}: ${result.status} (${result.duration_ms}ms)`);
      onTestComplete?.(result);
      return result;
    } finally {
      await channel.disconnect().catch(() => {});
    }
  });

  const conversationTasks = (testSpec.conversation_tests ?? []).map((spec) => async () => {
    console.log(`  Conversation: ${spec.caller_prompt.slice(0, 60)}...`);
    const channel = createAudioChannel(channelConfig);
    try {
      await channel.connect();
      const result = await runConversationTest(spec, channel);
      console.log(`    Status: ${result.status} (${result.duration_ms}ms)`);
      onTestComplete?.(result);
      return result;
    } finally {
      await channel.disconnect().catch(() => {});
    }
  });

  const totalTests = audioTasks.length + conversationTasks.length;
  console.log(`Running ${totalTests} tests in parallel (concurrency: ${concurrencyLimit})...`);

  // Run audio and conversation tests concurrently (within the shared concurrency limit)
  const [audioResults, conversationResults] = await Promise.all([
    runWithConcurrency(audioTasks, concurrencyLimit),
    runWithConcurrency(conversationTasks, concurrencyLimit),
  ]);

  const audioPassed = audioResults.filter((r) => r.status === "pass").length;
  const audioFailed = audioResults.filter((r) => r.status === "fail").length;
  const convPassed = conversationResults.filter((r) => r.status === "pass").length;
  const convFailed = conversationResults.filter((r) => r.status === "fail").length;

  const totalDurationMs =
    audioResults.reduce((sum, r) => sum + r.duration_ms, 0) +
    conversationResults.reduce((sum, r) => sum + r.duration_ms, 0);

  const aggregate: RunAggregateV2 = {
    audio_tests: { total: audioResults.length, passed: audioPassed, failed: audioFailed },
    conversation_tests: { total: conversationResults.length, passed: convPassed, failed: convFailed },
    total_duration_ms: totalDurationMs,
  };

  const status = audioFailed + convFailed === 0 ? "pass" : "fail";

  console.log(
    `Run complete: ${status} (audio: ${audioPassed}/${audioResults.length}, conversation: ${convPassed}/${conversationResults.length})`,
  );

  return { status, audioResults, conversationResults, aggregate };
}
