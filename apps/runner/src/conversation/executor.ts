/**
 * Conversation test executor — runs a full dynamic conversation loop.
 *
 * Flow:
 * 1. Caller LLM generates text from persona prompt
 * 2. TTS → send audio to agent via AudioChannel
 * 3. Collect agent audio (VAD for end-of-turn)
 * 4. STT → text back to caller LLM
 * 5. Repeat until max_turns or caller says [END]
 * 6. Judge LLM evaluates transcript against eval questions
 */

import type { AudioChannel } from "@voiceci/adapters";
import type {
  ConversationTestSpec,
  ConversationTestResult,
  ConversationTurn,
  ConversationMetrics,
} from "@voiceci/shared";
import { synthesize, transcribe } from "@voiceci/voice";
import { CallerLLM } from "./caller-llm.js";
import { JudgeLLM } from "./judge-llm.js";
import { collectUntilEndOfTurn } from "../audio-tests/helpers.js";
import { computeAllMetrics } from "../metrics/index.js";
import { AdaptiveThreshold } from "./adaptive-threshold.js";

export async function runConversationTest(
  spec: ConversationTestSpec,
  channel: AudioChannel
): Promise<ConversationTestResult> {
  const startTime = performance.now();
  const transcript: ConversationTurn[] = [];
  const ttfbValues: number[] = [];

  const caller = new CallerLLM(spec.caller_prompt);
  const adaptiveThreshold = new AdaptiveThreshold({
    baseMs: spec.silence_threshold_ms ?? 1500,
  });
  let agentText: string | null = null;

  for (let turn = 0; turn < spec.max_turns; turn++) {
    // Step 1: Caller LLM generates next utterance
    const callerText = await caller.nextUtterance(agentText, transcript);
    if (callerText === null) {
      // Caller decided to end conversation
      break;
    }

    // Step 2: TTS and send
    const callerAudio = await synthesize(callerText);
    const callerTimestamp = performance.now() - startTime;
    const audioDurationMs = Math.round((callerAudio.length / 2 / 24000) * 1000);

    transcript.push({
      role: "caller",
      text: callerText,
      timestamp_ms: Math.round(callerTimestamp),
      audio_duration_ms: audioDurationMs,
    });

    const sendTime = Date.now();
    channel.sendAudio(callerAudio);

    // Step 3: Collect agent response via VAD (adaptive threshold)
    const { audio: agentAudio, timedOut, stats } = await collectUntilEndOfTurn(
      channel,
      { timeoutMs: 15000, silenceThresholdMs: adaptiveThreshold.thresholdMs }
    );

    // Adapt threshold for next turn based on this turn's response cadence
    adaptiveThreshold.update(stats);

    const agentTimestamp = performance.now() - startTime;

    // Measure TTFB
    let turnTtfb: number | undefined;
    if (agentAudio.length > 0) {
      // Approximate TTFB from the time gap
      const responseDurationMs = Math.round((agentAudio.length / 2 / 24000) * 1000);
      const elapsed = Date.now() - sendTime;
      turnTtfb = Math.max(0, elapsed - responseDurationMs);
      ttfbValues.push(turnTtfb);
    }

    // Step 4: STT to get agent text
    if (agentAudio.length > 0) {
      const { text, confidence } = await transcribe(agentAudio);
      agentText = text;
      const agentAudioDurationMs = Math.round(
        (agentAudio.length / 2 / 24000) * 1000
      );

      transcript.push({
        role: "agent",
        text: agentText,
        timestamp_ms: Math.round(agentTimestamp),
        audio_duration_ms: agentAudioDurationMs,
        ttfb_ms: turnTtfb,
        stt_confidence: confidence,
      });
    } else {
      agentText = "";
      transcript.push({
        role: "agent",
        text: "",
        timestamp_ms: Math.round(agentTimestamp),
        ttfb_ms: turnTtfb,
      });
    }
  }

  // Step 6: Judge evaluates transcript (eval questions + behavioral metrics in parallel)
  const judge = new JudgeLLM();
  const [evalResults, behavioral] = await Promise.all([
    judge.evaluate(transcript, spec.eval),
    judge.evaluateStandardMetrics(transcript),
  ]);

  // Compute deep metrics (instant — pure functions)
  const totalDurationMs = Math.round(performance.now() - startTime);
  const meanTtfb =
    ttfbValues.length > 0
      ? Math.round(ttfbValues.reduce((a, b) => a + b, 0) / ttfbValues.length)
      : 0;

  const { transcript: transcriptMetrics, latency, talk_ratio } = computeAllMetrics(transcript);

  const metrics: ConversationMetrics = {
    turns: transcript.length,
    mean_ttfb_ms: meanTtfb,
    total_duration_ms: totalDurationMs,
    talk_ratio,
    transcript: transcriptMetrics,
    latency,
    behavioral,
  };

  // Status: pass only if all relevant eval questions passed
  const relevantResults = evalResults.filter((r) => r.relevant);
  const allPassed =
    relevantResults.length > 0 && relevantResults.every((r) => r.passed);

  return {
    caller_prompt: spec.caller_prompt,
    status: allPassed ? "pass" : "fail",
    transcript,
    eval_results: evalResults,
    duration_ms: totalDurationMs,
    metrics,
  };
}
