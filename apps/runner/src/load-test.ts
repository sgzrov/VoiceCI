/**
 * Load test coordinator — runs N concurrent AudioChannel connections
 * against an already-deployed agent, collecting latency metrics over time.
 *
 * Supports 4 traffic patterns: ramp, spike, sustained, soak.
 * Auto-detects breaking point where P95 TTFB exceeds 2x baseline.
 */

import type { LoadPattern, LoadTestResult, LoadTestTimepoint } from "@voiceci/shared";
import { createAudioChannel, type AudioChannelConfig } from "@voiceci/adapters";
import { synthesize } from "@voiceci/voice";
import { collectUntilEndOfTurn } from "./audio-tests/helpers.js";

export interface LoadTestOpts {
  channelConfig: AudioChannelConfig;
  pattern: LoadPattern;
  targetConcurrency: number;
  totalDurationS: number;
  rampDurationS?: number;
  holdDurationS?: number;
  callerPrompt: string;
  onTimepoint?: (tp: LoadTestTimepoint) => void;
}

interface CallResult {
  success: boolean;
  ttfbMs: number;
  durationMs: number;
  error?: string;
}

/**
 * Compute percentile from a sorted array.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

/**
 * Get target concurrency at a given elapsed time for the pattern.
 */
function getTargetConcurrency(
  pattern: LoadPattern,
  elapsedS: number,
  targetConcurrency: number,
  rampDurationS: number,
): number {
  switch (pattern) {
    case "ramp": {
      if (elapsedS < rampDurationS) {
        return Math.max(1, Math.floor((elapsedS / rampDurationS) * targetConcurrency));
      }
      return targetConcurrency;
    }
    case "spike": {
      // 5s warmup at 1 caller, then jump to target
      return elapsedS < 5 ? 1 : targetConcurrency;
    }
    case "sustained":
      return targetConcurrency;
    case "soak": {
      // 10% ramp, then hold
      const soakRamp = rampDurationS * 0.1;
      if (elapsedS < soakRamp) {
        return Math.max(1, Math.floor((elapsedS / soakRamp) * targetConcurrency));
      }
      return targetConcurrency;
    }
  }
}

/**
 * Run a single virtual caller: connect → send audio → measure TTFB → disconnect.
 */
async function runSingleCall(
  channelConfig: AudioChannelConfig,
  preRecordedAudio: Buffer,
): Promise<CallResult> {
  const start = Date.now();
  const channel = createAudioChannel(channelConfig);

  try {
    await channel.connect();
    const sendTime = Date.now();
    channel.sendAudio(preRecordedAudio);

    const { audio } = await collectUntilEndOfTurn(channel, {
      timeoutMs: 15000,
      silenceThresholdMs: 2000,
    });

    const elapsed = Date.now() - sendTime;
    const responseDurationMs = audio.length > 0 ? Math.round((audio.length / 2 / 24000) * 1000) : 0;
    const ttfbMs = Math.max(0, elapsed - responseDurationMs);

    return {
      success: true,
      ttfbMs,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      ttfbMs: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await channel.disconnect().catch(() => {});
  }
}

/**
 * Run a load test against an already-deployed agent.
 */
export async function runLoadTest(opts: LoadTestOpts): Promise<LoadTestResult> {
  const {
    channelConfig,
    pattern,
    targetConcurrency,
    totalDurationS,
    rampDurationS = Math.floor(totalDurationS * 0.3),
    callerPrompt,
    onTimepoint,
  } = opts;

  console.log(`Load test starting: pattern=${pattern}, target=${targetConcurrency}, duration=${totalDurationS}s`);

  // Pre-synthesize caller audio ONCE
  console.log("Pre-synthesizing caller audio...");
  const preRecordedAudio = await synthesize(callerPrompt);
  console.log(`Caller audio ready: ${Math.round(preRecordedAudio.length / 2 / 24000 * 1000)}ms`);

  const startTime = Date.now();
  const deadline = startTime + totalDurationS * 1000;
  const timeline: LoadTestTimepoint[] = [];
  const allResults: CallResult[] = [];

  let activeConnections = 0;
  let totalErrors = 0;

  // Metrics collection interval (every 1s)
  const recentResults: CallResult[] = [];
  let lastSnapshotTime = startTime;

  const collectSnapshot = () => {
    const now = Date.now();
    const elapsedS = Math.round((now - startTime) / 1000);

    const windowResults = recentResults.splice(0, recentResults.length);
    const ttfbs = windowResults
      .filter((r) => r.success)
      .map((r) => r.ttfbMs)
      .sort((a, b) => a - b);

    const windowErrors = windowResults.filter((r) => !r.success).length;
    totalErrors += windowErrors;

    const tp: LoadTestTimepoint = {
      elapsed_s: elapsedS,
      active_connections: activeConnections,
      ttfb_p50_ms: percentile(ttfbs, 50),
      ttfb_p95_ms: percentile(ttfbs, 95),
      ttfb_p99_ms: percentile(ttfbs, 99),
      error_rate: windowResults.length > 0 ? windowErrors / windowResults.length : 0,
      errors_cumulative: totalErrors,
    };

    timeline.push(tp);
    onTimepoint?.(tp);
    lastSnapshotTime = now;
  };

  // Snapshot timer
  const snapshotInterval = setInterval(collectSnapshot, 1000);

  try {
    // Main loop: spawn and manage virtual callers
    while (Date.now() < deadline) {
      const elapsedS = (Date.now() - startTime) / 1000;
      const targetNow = getTargetConcurrency(pattern, elapsedS, targetConcurrency, rampDurationS);

      // Spawn new callers to reach target
      while (activeConnections < targetNow && Date.now() < deadline) {
        activeConnections++;
        void (async () => {
          try {
            const result = await runSingleCall(channelConfig, preRecordedAudio);
            recentResults.push(result);
            allResults.push(result);
          } finally {
            activeConnections--;
          }
        })();

        // Small stagger to avoid thundering herd
        await new Promise((r) => setTimeout(r, 50));
      }

      // Wait before checking again
      await new Promise((r) => setTimeout(r, 200));
    }

    // Wait for remaining active connections to finish (up to 30s)
    const cleanupDeadline = Date.now() + 30_000;
    while (activeConnections > 0 && Date.now() < cleanupDeadline) {
      await new Promise((r) => setTimeout(r, 500));
    }

    // Final snapshot
    collectSnapshot();
  } finally {
    clearInterval(snapshotInterval);
  }

  // Compute summary
  const successfulResults = allResults.filter((r) => r.success);
  const failedResults = allResults.filter((r) => !r.success);
  const allTtfbs = successfulResults.map((r) => r.ttfbMs).sort((a, b) => a - b);
  const allDurations = allResults.map((r) => r.durationMs);

  // Detect breaking point: where P95 > 2x baseline P95
  const baselineP95 = timeline.length > 2 ? timeline[1]!.ttfb_p95_ms : 0;
  let breakingPoint: number | undefined;
  if (baselineP95 > 0) {
    for (const tp of timeline) {
      if (tp.ttfb_p95_ms > baselineP95 * 2 && tp.active_connections > 1) {
        breakingPoint = tp.active_connections;
        break;
      }
    }
  }

  const result: LoadTestResult = {
    status: failedResults.length / Math.max(allResults.length, 1) > 0.1 ? "fail" : "pass",
    pattern,
    target_concurrency: targetConcurrency,
    actual_peak_concurrency: Math.max(...timeline.map((t) => t.active_connections), 0),
    total_calls: allResults.length,
    successful_calls: successfulResults.length,
    failed_calls: failedResults.length,
    timeline,
    summary: {
      ttfb_p50_ms: percentile(allTtfbs, 50),
      ttfb_p95_ms: percentile(allTtfbs, 95),
      ttfb_p99_ms: percentile(allTtfbs, 99),
      error_rate: failedResults.length / Math.max(allResults.length, 1),
      breaking_point: breakingPoint,
      mean_call_duration_ms: allDurations.length > 0
        ? Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length)
        : 0,
    },
    duration_ms: Date.now() - startTime,
  };

  console.log(
    `Load test complete: ${result.status} — ${result.total_calls} calls, ` +
    `${result.successful_calls} success, ${result.failed_calls} failed, ` +
    `P95 TTFB: ${result.summary.ttfb_p95_ms}ms` +
    (breakingPoint ? `, breaking point: ${breakingPoint} concurrent` : ""),
  );

  return result;
}
