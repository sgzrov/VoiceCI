/**
 * In-process test runner for already-deployed agents (SIP, WebRTC, ws-voice with agent_url).
 *
 * Runs tests directly in the API process — no Fly Machine needed since the agent
 * is already running. Results are pushed to Claude via MCP sendLoggingMessage
 * as each test completes.
 */

import { eq } from "drizzle-orm";
import { schema, type Database } from "@voiceci/db";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AudioChannelConfig } from "@voiceci/adapters";
import type { TestSpec, AudioTestThresholds, AudioTestResult, ConversationTestResult, LoadPattern, LoadTestTimepoint } from "@voiceci/shared";
import { executeTests } from "@voiceci/runner/executor";
import { runLoadTest } from "@voiceci/runner/load-test";
import { mcpServers, runToSession } from "../routes/mcp.js";

export interface InProcessTestOpts {
  runId: string;
  testSpec: TestSpec;
  channelConfig: AudioChannelConfig;
  audioTestThresholds?: AudioTestThresholds;
  sessionId?: string;
}

/**
 * Run tests in-process and push results via SSE.
 * Non-blocking — fires and returns immediately.
 */
export function runTestsInProcess(db: Database, opts: InProcessTestOpts): void {
  const { runId, testSpec, channelConfig, audioTestThresholds, sessionId } = opts;

  // Fire and forget — errors are logged and stored in DB
  void (async () => {
    // Mark run as running
    await db
      .update(schema.runs)
      .set({ status: "running", started_at: new Date() })
      .where(eq(schema.runs.id, runId));

    const mcpServer = sessionId ? mcpServers.get(sessionId) : undefined;

    try {
      const { status, audioResults, conversationResults, aggregate } = await executeTests({
        testSpec,
        channelConfig,
        audioTestThresholds,
        onTestComplete: (result) => {
          // Push each result via SSE as it completes
          if (mcpServer) {
            void pushResult(mcpServer, runId, result);
          }
        },
      });

      // Store results in DB
      for (const result of audioResults) {
        await db.insert(schema.scenarioResults).values({
          run_id: runId,
          name: result.test_name,
          status: result.status,
          test_type: "audio",
          metrics_json: result,
          trace_json: [],
        });
      }

      for (const result of conversationResults) {
        await db.insert(schema.scenarioResults).values({
          run_id: runId,
          name: result.name ?? `conversation:${result.caller_prompt.slice(0, 50)}`,
          status: result.status,
          test_type: "conversation",
          metrics_json: result,
          trace_json: result.transcript,
        });
      }

      // Update run status
      await db
        .update(schema.runs)
        .set({
          status,
          finished_at: new Date(),
          duration_ms: aggregate.total_duration_ms,
          aggregate_json: aggregate,
        })
        .where(eq(schema.runs.id, runId));

      // Push final summary via SSE
      if (mcpServer) {
        await mcpServer.sendLoggingMessage({
          level: status === "pass" ? "info" : "warning",
          logger: "voiceci:test-result",
          data: {
            run_id: runId,
            status,
            aggregate,
            audio_results: audioResults,
            conversation_results: conversationResults,
          },
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`In-process run ${runId} failed:`, errorMessage);

      await db
        .update(schema.runs)
        .set({
          status: "fail",
          finished_at: new Date(),
          error_text: errorMessage,
        })
        .where(eq(schema.runs.id, runId));

      if (mcpServer) {
        await mcpServer.sendLoggingMessage({
          level: "error",
          logger: "voiceci:test-result",
          data: { run_id: runId, status: "fail", error_text: errorMessage },
        });
      }
    } finally {
      runToSession.delete(runId);
    }
  })();
}

// ============================================================
// Load testing
// ============================================================

export interface LoadTestInProcessOpts {
  channelConfig: AudioChannelConfig;
  pattern: LoadPattern;
  targetConcurrency: number;
  totalDurationS: number;
  rampDurationS?: number;
  callerPrompt: string;
  sessionId?: string;
}

/**
 * Run load test in-process and push results via SSE.
 * Non-blocking — fires and returns immediately, resolves with result.
 */
export function runLoadTestInProcess(opts: LoadTestInProcessOpts): void {
  const { sessionId, ...loadTestOpts } = opts;

  void (async () => {
    const mcpServer = sessionId ? mcpServers.get(sessionId) : undefined;

    try {
      const result = await runLoadTest({
        ...loadTestOpts,
        onTimepoint: (tp) => {
          if (mcpServer) {
            void mcpServer.sendLoggingMessage({
              level: "info",
              logger: "voiceci:load-test-progress",
              data: tp,
            }).catch(() => {});
          }
        },
      });

      if (mcpServer) {
        await mcpServer.sendLoggingMessage({
          level: result.status === "pass" ? "info" : "warning",
          logger: "voiceci:load-test-result",
          data: result,
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Load test failed:", errorMessage);

      if (mcpServer) {
        await mcpServer.sendLoggingMessage({
          level: "error",
          logger: "voiceci:load-test-result",
          data: { status: "fail", error_text: errorMessage },
        });
      }
    }
  })();
}

async function pushResult(
  mcpServer: McpServer,
  runId: string,
  result: AudioTestResult | ConversationTestResult,
): Promise<void> {
  try {
    await mcpServer.sendLoggingMessage({
      level: result.status === "pass" ? "info" : "warning",
      logger: "voiceci:test-progress",
      data: { run_id: runId, result },
    });
  } catch {
    // SSE push failed — session may have closed, non-fatal
  }
}
