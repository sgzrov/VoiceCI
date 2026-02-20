import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { schema } from "@voiceci/db";
import { RunnerCallbackSchema, RUNNER_CALLBACK_HEADER } from "@voiceci/shared";

export async function callbackRoutes(app: FastifyInstance) {
  app.post("/internal/runner-callback", async (request, reply) => {
    const secret = (request.headers as Record<string, string>)[RUNNER_CALLBACK_HEADER];
    const expectedSecret = process.env["RUNNER_CALLBACK_SECRET"];

    if (!expectedSecret || secret !== expectedSecret) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const body = RunnerCallbackSchema.parse(request.body);

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

    for (const result of body.scenario_results) {
      await app.db.insert(schema.scenarioResults).values({
        run_id: body.run_id,
        name: result.name,
        status: result.status,
        metrics_json: result.metrics,
        trace_json: result.trace,
        trace_ref: result.trace_ref ?? null,
      });
    }

    return reply.send({ ok: true });
  });
}
