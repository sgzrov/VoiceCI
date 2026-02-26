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
  progressToken?: string | number;
}

/**
 * Run load test in-process and push results via SSE.
 * Non-blocking — fires and returns immediately, resolves with result.
 */
export function runLoadTestInProcess(opts: LoadTestInProcessOpts): void {
  const { sessionId, progressToken, ...loadTestOpts } = opts;

  void (async () => {
    const mcpServer = sessionId ? mcpServers.get(sessionId) : undefined;
    let timepointCount = 0;

    try {
      const result = await runLoadTest({
        ...loadTestOpts,
        onTimepoint: (tp) => {
          if (!mcpServer) return;
          timepointCount++;

          if (progressToken !== undefined) {
            void mcpServer.server.notification({
              method: "notifications/progress",
              params: {
                progressToken,
                progress: tp.elapsed_s,
                total: loadTestOpts.totalDurationS,
                message: `${tp.active_connections} connections | p95=${tp.ttfb_p95_ms}ms | errors=${tp.error_rate.toFixed(2)}`,
              },
            }).catch(() => {});
          } else {
            void mcpServer.sendLoggingMessage({
              level: "info",
              logger: "voiceci:load-test-progress",
              data: tp,
            }).catch(() => {});
          }
        },
      });

      if (mcpServer) {
        if (progressToken !== undefined) {
          await mcpServer.server.notification({
            method: "notifications/progress",
            params: {
              progressToken,
              progress: loadTestOpts.totalDurationS,
              total: loadTestOpts.totalDurationS,
              message: `${result.status}: ${result.successful_calls}/${result.total_calls} calls, p95=${result.summary.ttfb_p95_ms}ms — call voiceci_get_status for full results`,
            },
          });
        } else {
          await mcpServer.sendLoggingMessage({
            level: result.status === "pass" ? "info" : "warning",
            logger: "voiceci:load-test-result",
            data: result,
          });
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Load test failed:", errorMessage);

      if (mcpServer) {
        if (progressToken !== undefined) {
          await mcpServer.server.notification({
            method: "notifications/progress",
            params: {
              progressToken,
              progress: loadTestOpts.totalDurationS,
              total: loadTestOpts.totalDurationS,
              message: `fail: ${errorMessage}`,
            },
          }).catch(() => {});
        } else {
          await mcpServer.sendLoggingMessage({
            level: "error",
            logger: "voiceci:load-test-result",
            data: { status: "fail", error_text: errorMessage },
          });
        }
      }
    }
  })();
}
