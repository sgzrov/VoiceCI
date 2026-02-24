/**
 * In-process runners for lightweight operations that don't need queueing.
 * Test suite execution has moved to the worker via BullMQ per-user queues.
 */

import type { AudioChannelConfig } from "@voiceci/adapters";
import type { LoadPattern } from "@voiceci/shared";
import { runLoadTest } from "@voiceci/runner/load-test";
import { mcpServers } from "../routes/mcp.js";

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
