/**
 * Latency metrics — percentiles, turn gaps, silence detection.
 */

import type { ConversationTurn, LatencyMetrics } from "@voiceci/shared";

/**
 * Compute percentile from a sorted array of numbers.
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
 * Compute latency metrics from conversation turns.
 * Expects turns to have ttfb_ms populated on agent turns.
 */
export function computeLatencyMetrics(turns: ConversationTurn[]): LatencyMetrics {
  const agentTurns = turns.filter((t) => t.role === "agent");
  const ttfbValues = agentTurns
    .map((t) => t.ttfb_ms)
    .filter((v): v is number => v !== undefined);

  const sorted = [...ttfbValues].sort((a, b) => a - b);

  // Turn gaps: time between end of one turn and start of next
  const turnGaps: number[] = [];
  for (let i = 1; i < turns.length; i++) {
    const prev = turns[i - 1]!;
    const curr = turns[i]!;
    const prevEnd = prev.timestamp_ms + (prev.audio_duration_ms ?? 0);
    const gap = curr.timestamp_ms - prevEnd;
    if (gap > 0) turnGaps.push(gap);
  }

  // Total silence: sum of gaps where no one is talking
  const totalSilenceMs = turnGaps.reduce((sum, g) => sum + g, 0);

  const meanTurnGapMs = turnGaps.length > 0
    ? turnGaps.reduce((sum, g) => sum + g, 0) / turnGaps.length
    : 0;

  return {
    ttfb_per_turn_ms: ttfbValues,
    p50_ttfb_ms: percentile(sorted, 50),
    p95_ttfb_ms: percentile(sorted, 95),
    p99_ttfb_ms: percentile(sorted, 99),
    first_turn_ttfb_ms: ttfbValues[0] ?? 0,
    total_silence_ms: totalSilenceMs,
    mean_turn_gap_ms: meanTurnGapMs,
  };
}
