import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { schema } from "@voiceci/db";
import { RunnerCallbackV2Schema, RUNNER_CALLBACK_HEADER } from "@voiceci/shared";
import { runToSession, runToProgress, mcpServers } from "./mcp.js";

export async function callbackRoutes(app: FastifyInstance) {
  // --- Builder dep-image callback ---
  app.post("/internal/dep-image-callback", async (request, reply) => {
    const secret = (request.headers as Record<string, string>)[RUNNER_CALLBACK_HEADER];
    const expectedSecret = process.env["RUNNER_CALLBACK_SECRET"];

    if (!expectedSecret || secret !== expectedSecret) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const body = request.body as {
      lockfile_hash: string;
      image_ref: string;
      status: "ready" | "failed";
      error_text?: string;
    };

    if (body.status === "ready") {
      await app.db
        .update(schema.depImages)
        .set({
          status: "ready",
          image_ref: body.image_ref,
          ready_at: new Date(),
        })
        .where(eq(schema.depImages.lockfile_hash, body.lockfile_hash));
    } else {
      await app.db
        .update(schema.depImages)
        .set({
          status: "failed",
          error_text: body.error_text ?? "Unknown builder error",
        })
        .where(eq(schema.depImages.lockfile_hash, body.lockfile_hash));
    }

    return reply.send({ ok: true });
  });

  // --- Per-test progress callback (from runner) ---
  app.post("/internal/test-progress", async (request, reply) => {
    const secret = (request.headers as Record<string, string>)[RUNNER_CALLBACK_HEADER];
    const expectedSecret = process.env["RUNNER_CALLBACK_SECRET"];

    if (!expectedSecret || secret !== expectedSecret) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const body = request.body as {
      run_id: string;
      completed: number;
      total: number;
      test_type: "audio" | "conversation";
      test_name: string;
      status: "pass" | "fail";
      duration_ms: number;
    };

    // Forward as progress notification to MCP client
    const sessionId = runToSession.get(body.run_id);
    if (sessionId) {
      const mcpServer = mcpServers.get(sessionId);
      const progressToken = runToProgress.get(body.run_id);

      if (mcpServer && progressToken !== undefined) {
        try {
          await mcpServer.server.notification({
            method: "notifications/progress",
            params: {
              progressToken,
              progress: body.completed,
              total: body.total,
              message: `${body.test_name}: ${body.status} (${body.duration_ms}ms)`,
            },
          });
        } catch {
          // Best-effort
        }
      } else if (mcpServer) {
        try {
          await mcpServer.sendLoggingMessage({
            level: body.status === "pass" ? "info" : "warning",
            logger: "voiceci:test-progress",
            data: body,
          });
        } catch {
          // Best-effort
        }
      }
    }

    return reply.send({ ok: true });
  });

  // --- Runner results callback ---
  app.post("/internal/runner-callback", async (request, reply) => {
    const secret = (request.headers as Record<string, string>)[RUNNER_CALLBACK_HEADER];
    const expectedSecret = process.env["RUNNER_CALLBACK_SECRET"];

    if (!expectedSecret || secret !== expectedSecret) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const body = RunnerCallbackV2Schema.parse(request.body);

    await app.db
      .update(schema.runs)
      .set({
        status: body.status,
        finished_at: new Date(),
        duration_ms: body.aggregate.total_duration_ms,
        aggregate_json: body.aggregate,
        error_text: body.error_text ?? null,
      })
      .where(eq(schema.runs.id, body.run_id));

    // Store audio test results
    for (const result of body.audio_results) {
      await app.db.insert(schema.scenarioResults).values({
        run_id: body.run_id,
        name: result.test_name,
        status: result.status,
        test_type: "audio",
        metrics_json: result,
        trace_json: [],
      });
    }

    // Store conversation test results
    for (const result of body.conversation_results) {
      await app.db.insert(schema.scenarioResults).values({
        run_id: body.run_id,
        name: result.name ?? `conversation:${result.caller_prompt.slice(0, 50)}`,
        status: result.status,
        test_type: "conversation",
        metrics_json: result,
        trace_json: result.transcript,
      });
    }

    // Push result to MCP client via SSE if session exists
    const sessionId = runToSession.get(body.run_id);
    if (sessionId) {
      const mcpServer = mcpServers.get(sessionId);
      const progressToken = runToProgress.get(body.run_id);
      try {
        if (mcpServer && progressToken !== undefined) {
          // Use notifications/progress when progressToken is available
          const totalTests =
            body.audio_results.length + body.conversation_results.length;
          await mcpServer.server.notification({
            method: "notifications/progress",
            params: {
              progressToken,
              progress: totalTests,
              total: totalTests,
              message: `${body.status}: ${body.aggregate.audio_tests.passed}/${body.aggregate.audio_tests.total} audio, ${body.aggregate.conversation_tests.passed}/${body.aggregate.conversation_tests.total} conversation — call voiceci_get_status for full results`,
            },
          });
        } else if (mcpServer) {
          // Fallback to logging when no progressToken
          await mcpServer.sendLoggingMessage({
            level: body.status === "pass" ? "info" : "warning",
            logger: "voiceci:test-result",
            data: {
              run_id: body.run_id,
              status: body.status,
              aggregate: body.aggregate,
              audio_results: body.audio_results,
              conversation_results: body.conversation_results,
              error_text: body.error_text ?? null,
            },
          });
        }
      } catch (err) {
        app.log.warn(
          { run_id: body.run_id, error: err instanceof Error ? err.message : String(err) },
          "Failed to push SSE test result to MCP client"
        );
      } finally {
        runToSession.delete(body.run_id);
        runToProgress.delete(body.run_id);
      }
    }

    return reply.send({ ok: true });
  });
}
