import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { schema } from "@voiceci/db";
import { z } from "zod";

const CreateRunBody = z.object({
  source_type: z.enum(["bundle", "remote"]),
  bundle_key: z.string().min(1).optional(),
  bundle_hash: z.string().min(1).optional(),
});

export async function runRoutes(app: FastifyInstance) {
  app.post("/runs", async (request, reply) => {
    const body = CreateRunBody.parse(request.body);

    const [run] = await app.db
      .insert(schema.runs)
      .values({
        source_type: body.source_type,
        bundle_key: body.bundle_key,
        bundle_hash: body.bundle_hash,
        status: "queued",
      })
      .returning();

    await app.runQueue.add("execute-run", {
      run_id: run!.id,
      bundle_key: body.bundle_key,
      bundle_hash: body.bundle_hash,
    });

    return reply.status(201).send(run);
  });

  app.get("/runs", async (request, reply) => {
    const query = request.query as { status?: string; limit?: string };
    const limit = Math.min(parseInt(query.limit ?? "50", 10), 200);

    let q = app.db
      .select()
      .from(schema.runs)
      .orderBy(desc(schema.runs.created_at))
      .limit(limit);

    if (query.status) {
      q = q.where(
        eq(schema.runs.status, query.status as "queued" | "running" | "pass" | "fail")
      ) as typeof q;
    }

    const rows = await q;
    return reply.send(rows);
  });

  app.get<{ Params: { id: string } }>("/runs/:id", async (request, reply) => {
    const { id } = request.params;

    const [run] = await app.db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.id, id))
      .limit(1);

    if (!run) {
      return reply.status(404).send({ error: "Run not found" });
    }

    const scenarios = await app.db
      .select()
      .from(schema.scenarioResults)
      .where(eq(schema.scenarioResults.run_id, id));

    const artifactRows = await app.db
      .select()
      .from(schema.artifacts)
      .where(eq(schema.artifacts.run_id, id));

    const [baseline] = await app.db
      .select()
      .from(schema.baselines)
      .where(eq(schema.baselines.run_id, id))
      .limit(1);

    return reply.send({
      ...run,
      scenarios,
      artifacts: artifactRows,
      is_baseline: !!baseline,
    });
  });

  app.post<{ Params: { id: string } }>(
    "/runs/:id/baseline",
    async (request, reply) => {
      const { id } = request.params;

      const [run] = await app.db
        .select()
        .from(schema.runs)
        .where(eq(schema.runs.id, id))
        .limit(1);

      if (!run) {
        return reply.status(404).send({ error: "Run not found" });
      }

      const [baseline] = await app.db
        .insert(schema.baselines)
        .values({ run_id: id })
        .returning();

      return reply.status(201).send(baseline);
    }
  );
}
