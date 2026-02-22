import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { schema } from "@voiceci/db";
import { RunnerCallbackV2Schema, RUNNER_CALLBACK_HEADER } from "@voiceci/shared";

export async function callbackRoutes(app: FastifyInstance) {
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
        name: `conversation:${result.caller_prompt.slice(0, 50)}`,
        status: result.status,
        test_type: "conversation",
        metrics_json: result,
        trace_json: result.transcript,
      });
    }

    return reply.send({ ok: true });
  });
}
