/**
 * VAD-derived audio analysis metrics.
 *
 * Computes talk ratio, monologue detection, silence gap analysis, and
 * per-turn speech patterns from batch VAD speech segments.
 */

import type { AudioAnalysisMetrics } from "@voiceci/shared";
import type { SpeechSegment } from "@voiceci/voice";

export interface TurnAudioData {
  role: "caller" | "agent";
  audioDurationMs: number;
  /** Speech segments from batch VAD (only present for agent turns) */
  speechSegments?: SpeechSegment[];
}

const SILENCE_GAP_THRESHOLD_MS = 2000;

/**
 * Compute VAD-derived audio analysis metrics from per-turn audio data.
 * Caller turns don't need VAD (TTS output is 100% speech).
 * Agent turns have speech segments from batch VAD analysis.
 */
export function computeAudioAnalysisMetrics(
  turns: TurnAudioData[]
): AudioAnalysisMetrics {
  const agentTurns = turns.filter((t) => t.role === "agent" && t.speechSegments);
  const callerTurns = turns.filter((t) => t.role === "caller");

  const totalCallerAudioMs = callerTurns.reduce((sum, t) => sum + t.audioDurationMs, 0);
  const totalAgentAudioMs = agentTurns.reduce((sum, t) => sum + t.audioDurationMs, 0);

  // Collect all agent speech segments and compute per-turn stats
  let totalAgentSpeechMs = 0;
  let longestMonologueMs = 0;
  let silenceGapsOver2s = 0;
  let totalInternalSilenceMs = 0;
  const perTurnSpeechSegments: number[] = [];
  const perTurnInternalSilenceMs: number[] = [];
  const allSegmentDurations: number[] = [];

  for (const turn of agentTurns) {
    const segments = turn.speechSegments!;
    perTurnSpeechSegments.push(segments.length);

    let turnSpeechMs = 0;
    let turnInternalSilenceMs = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const segDuration = seg.endMs - seg.startMs;
      turnSpeechMs += segDuration;
      allSegmentDurations.push(segDuration);

      // Track longest monologue
      if (segDuration > longestMonologueMs) {
        longestMonologueMs = segDuration;
      }

      // Compute gap to next segment (internal silence)
      if (i < segments.length - 1) {
        const gap = segments[i + 1]!.startMs - seg.endMs;
        if (gap > 0) {
          turnInternalSilenceMs += gap;
          if (gap >= SILENCE_GAP_THRESHOLD_MS) {
            silenceGapsOver2s++;
          }
        }
      }
    }

    totalAgentSpeechMs += turnSpeechMs;
    totalInternalSilenceMs += turnInternalSilenceMs;
    perTurnInternalSilenceMs.push(Math.round(turnInternalSilenceMs));
  }

  // Agent speech ratio: how much of agent's air time is actual speech
  const agentSpeechRatio =
    totalAgentAudioMs > 0 ? totalAgentSpeechMs / totalAgentAudioMs : 0;

  // VAD-corrected talk ratio: caller time / (caller time + agent SPEECH time)
  const totalSpeechMs = totalCallerAudioMs + totalAgentSpeechMs;
  const talkRatioVad =
    totalSpeechMs > 0 ? totalCallerAudioMs / totalSpeechMs : 0;

  // Mean segment duration
  const meanSegmentMs =
    allSegmentDurations.length > 0
      ? allSegmentDurations.reduce((a, b) => a + b, 0) / allSegmentDurations.length
      : 0;

  return {
    agent_speech_ratio: round3(agentSpeechRatio),
    talk_ratio_vad: round3(talkRatioVad),
    longest_monologue_ms: Math.round(longestMonologueMs),
    silence_gaps_over_2s: silenceGapsOver2s,
    total_internal_silence_ms: Math.round(totalInternalSilenceMs),
    per_turn_speech_segments: perTurnSpeechSegments,
    per_turn_internal_silence_ms: perTurnInternalSilenceMs,
    mean_agent_speech_segment_ms: Math.round(meanSegmentMs),
  };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
