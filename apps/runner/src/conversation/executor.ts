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

export async function runConversationTest(
  spec: ConversationTestSpec,
  channel: AudioChannel
): Promise<ConversationTestResult> {
  const startTime = performance.now();
  const transcript: ConversationTurn[] = [];
  const ttfbValues: number[] = [];

  const caller = new CallerLLM(spec.caller_prompt);
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

    // Step 3: Collect agent response via VAD
    const { audio: agentAudio, timedOut } = await collectUntilEndOfTurn(
      channel,
      { timeoutMs: 15000, silenceThresholdMs: 1500 }
    );

    const agentTimestamp = performance.now() - startTime;

    // Measure TTFB
    if (agentAudio.length > 0) {
      // Approximate TTFB from the time gap
      const responseDurationMs = Math.round((agentAudio.length / 2 / 24000) * 1000);
      const elapsed = Date.now() - sendTime;
      const ttfb = Math.max(0, elapsed - responseDurationMs);
      ttfbValues.push(ttfb);
    }

    // Step 4: STT to get agent text
    if (agentAudio.length > 0) {
      const { text } = await transcribe(agentAudio);
      agentText = text;
      const agentAudioDurationMs = Math.round(
        (agentAudio.length / 2 / 24000) * 1000
      );

      transcript.push({
        role: "agent",
        text: agentText,
        timestamp_ms: Math.round(agentTimestamp),
        audio_duration_ms: agentAudioDurationMs,
      });
    } else {
      agentText = "";
      transcript.push({
        role: "agent",
        text: "",
        timestamp_ms: Math.round(agentTimestamp),
      });
    }
  }

  // Step 6: Judge evaluates transcript
  const judge = new JudgeLLM();
  const evalResults = await judge.evaluate(transcript, spec.eval);

  // Compute metrics
  const totalDurationMs = Math.round(performance.now() - startTime);
  const meanTtfb =
    ttfbValues.length > 0
      ? Math.round(ttfbValues.reduce((a, b) => a + b, 0) / ttfbValues.length)
      : 0;

  const metrics: ConversationMetrics = {
    turns: transcript.length,
    mean_ttfb_ms: meanTtfb,
    total_duration_ms: totalDurationMs,
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
