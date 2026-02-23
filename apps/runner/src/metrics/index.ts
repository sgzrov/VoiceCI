/**
 * Metric orchestrator — computes all transcript + latency metrics from turns.
 */

import type { ConversationTurn, TranscriptMetrics, LatencyMetrics } from "@voiceci/shared";
import { computeTranscriptMetrics } from "./transcript.js";
import { computeLatencyMetrics } from "./latency.js";

export interface ComputedMetrics {
  transcript: TranscriptMetrics;
  latency: LatencyMetrics;
  talk_ratio: number | undefined;
}

/**
 * Compute all non-LLM metrics from conversation turns.
 * These are pure, instant computations with no external calls.
 */
export function computeAllMetrics(turns: ConversationTurn[]): ComputedMetrics {
  const transcript = computeTranscriptMetrics(turns);
  const latency = computeLatencyMetrics(turns);

  // Talk ratio: caller audio duration / total audio duration
  const callerAudioMs = turns
    .filter((t) => t.role === "caller")
    .reduce((sum, t) => sum + (t.audio_duration_ms ?? 0), 0);
  const agentAudioMs = turns
    .filter((t) => t.role === "agent")
    .reduce((sum, t) => sum + (t.audio_duration_ms ?? 0), 0);
  const totalAudioMs = callerAudioMs + agentAudioMs;
  const talk_ratio = totalAudioMs > 0 ? callerAudioMs / totalAudioMs : undefined;

  return { transcript, latency, talk_ratio };
}

export { computeTranscriptMetrics } from "./transcript.js";
export { computeLatencyMetrics } from "./latency.js";
