import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { schema } from "@voiceci/db";
import { McpRequestSchema } from "@voiceci/shared";

export async function mcpRoutes(app: FastifyInstance) {
  app.post("/mcp", async (request, reply) => {
    const rpc = McpRequestSchema.parse(request.body);

    switch (rpc.method) {
      case "run_voice_ci": {
        const params = rpc.params as {
          bundle_key: string;
          bundle_hash: string;
          mode?: string;
        };

        const [run] = await app.db
          .insert(schema.runs)
          .values({
            source_type: "bundle",
            bundle_key: params.bundle_key,
            bundle_hash: params.bundle_hash,
            status: "queued",
          })
          .returning();

        await app.runQueue.add("execute-run", {
          run_id: run!.id,
          bundle_key: params.bundle_key,
          bundle_hash: params.bundle_hash,
          mode: params.mode ?? "smoke",
        });

        return reply.send({
          jsonrpc: "2.0",
          id: rpc.id,
          result: { run_id: run!.id, status: "queued" },
        });
      }

      case "get_run_status": {
        const params = rpc.params as { run_id: string };
        const [run] = await app.db
          .select()
          .from(schema.runs)
          .where(eq(schema.runs.id, params.run_id))
          .limit(1);

        if (!run) {
          return reply.send({
            jsonrpc: "2.0",
            id: rpc.id,
            error: { code: -32001, message: "Run not found" },
          });
        }

        return reply.send({
          jsonrpc: "2.0",
          id: rpc.id,
          result: { run_id: run.id, status: run.status },
        });
      }

      case "get_run_result": {
        const params = rpc.params as { run_id: string };
        const [run] = await app.db
          .select()
          .from(schema.runs)
          .where(eq(schema.runs.id, params.run_id))
          .limit(1);

        if (!run) {
          return reply.send({
            jsonrpc: "2.0",
            id: rpc.id,
            error: { code: -32001, message: "Run not found" },
          });
        }

        const scenarios = await app.db
          .select()
          .from(schema.scenarioResults)
          .where(eq(schema.scenarioResults.run_id, params.run_id));

        return reply.send({
          jsonrpc: "2.0",
          id: rpc.id,
          result: { ...run, scenarios },
        });
      }

      case "list_test_suites": {
        return reply.send({
          jsonrpc: "2.0",
          id: rpc.id,
          result: {
            suites: [
              { id: "basic", name: "Basic Suite", path: "demo/suites/basic.json" },
              {
                id: "interruptions",
                name: "Interruptions Suite",
                path: "demo/suites/interruptions.json",
              },
            ],
          },
        });
      }

      default:
        return reply.send({
          jsonrpc: "2.0",
          id: rpc.id,
          error: { code: -32601, message: `Method not found: ${rpc.method}` },
        });
    }
  });
}
