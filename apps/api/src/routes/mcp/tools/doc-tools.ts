import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  SETUP_GUIDE,
  AUDIO_TEST_REFERENCE,
  SCENARIO_GUIDE,
  EVAL_EXAMPLES,
  RESULT_GUIDE,
} from "../docs.js";

export function registerDocTools(server: McpServer) {
  server.registerTool("voiceci_get_setup_guide", {
    title: "Setup Guide",
    description: "Get setup instructions for connecting VoiceCI to Claude Code, Cursor, Windsurf, and team sharing via .mcp.json. Call this when a user asks how to install or configure VoiceCI.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async () => ({
    content: [{ type: "text" as const, text: SETUP_GUIDE }],
  }));

  server.registerTool("voiceci_get_audio_test_reference", {
    title: "Audio Test Reference",
    description: "Get the audio test reference: available tests (echo, ttfb, barge_in, etc.), default thresholds, override keys, and VAD-derived audio analysis metrics. Call this when setting up audio_tests or interpreting audio metrics.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async () => ({
    content: [{ type: "text" as const, text: AUDIO_TEST_REFERENCE }],
  }));

  server.registerTool("voiceci_get_scenario_guide", {
    title: "Scenario Design Guide",
    description: "Get the scenario design guide: agent analysis steps, code-to-scenario mapping, 7 persona archetypes, scenario generation checklist, and conversation test authoring (caller_prompt, eval, max_turns, silence_threshold_ms). Call this when designing conversation tests for an agent.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async () => ({
    content: [{ type: "text" as const, text: SCENARIO_GUIDE }],
  }));

  server.registerTool("voiceci_get_eval_examples", {
    title: "Eval & Red-Teaming Guide",
    description: "Get eval examples and red-teaming guide: 4 attack categories (prompt injection, PII extraction, jailbreak, compliance), tool call testing (capture methods per adapter, writing tool_call_eval, pipeline agent wrappers). Call this when writing eval questions or red-team scenarios.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async () => ({
    content: [{ type: "text" as const, text: EVAL_EXAMPLES }],
  }));

  server.registerTool("voiceci_get_result_guide", {
    title: "Result Interpretation Guide",
    description: "Get result interpretation guide: audio/conversation failure diagnosis, behavioral metrics (intent accuracy, empathy, safety), harness overhead, iterative testing strategy (smoke→analyze→follow-up), regression testing, and pinning scenario generation. Call this when analyzing test results or planning follow-up tests.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async () => ({
    content: [{ type: "text" as const, text: RESULT_GUIDE }],
  }));
}
