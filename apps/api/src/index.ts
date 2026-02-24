import Fastify from "fastify";
import cors from "@fastify/cors";
import { eq, lt, and } from "drizzle-orm";
import { schema } from "@voiceci/db";
import { healthRoutes } from "./routes/health.js";
import { uploadRoutes } from "./routes/uploads.js";
import { runRoutes } from "./routes/runs.js";
import { callbackRoutes } from "./routes/callback.js";
import { mcpRoutes } from "./routes/mcp.js";
import { keyRoutes } from "./routes/keys.js";
import { dbPlugin } from "./plugins/db.js";
import { queuePlugin } from "./plugins/queue.js";
import { authPlugin } from "./plugins/auth.js";

const port = parseInt(process.env["API_PORT"] ?? "3000", 10);
const host = process.env["API_HOST"] ?? "0.0.0.0";

async function main() {
  const app = Fastify({
    logger: {
      level: "info",
    },
  });

  await app.register(cors, {
    origin: true,
    exposedHeaders: ["Mcp-Session-Id", "Mcp-Protocol-Version"],
  });
  await app.register(dbPlugin);
  await app.register(queuePlugin);
  await app.register(authPlugin);
  await app.register(healthRoutes);
  await app.register(uploadRoutes);
  await app.register(runRoutes);
  await app.register(callbackRoutes);
  await app.register(keyRoutes);
  await app.register(mcpRoutes);

  await app.listen({ port, host });
  console.log(`VoiceCI API listening on ${host}:${port}`);

  // Stuck run cleanup — mark runs stuck in "running" for >10 minutes as failed
  const CLEANUP_INTERVAL_MS = 60_000;
  const STUCK_THRESHOLD_MS = 10 * 60_000;

  const cleanupInterval = setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);
      const stuck = await app.db
        .update(schema.runs)
        .set({
          status: "fail",
          finished_at: new Date(),
          error_text: "Run timed out (server may have restarted)",
        })
        .where(
          and(
            eq(schema.runs.status, "running"),
            lt(schema.runs.started_at, cutoff),
          )
        )
        .returning({ id: schema.runs.id });

      if (stuck.length > 0) {
        console.log(`Cleaned up ${stuck.length} stuck run(s): ${stuck.map((r) => r.id).join(", ")}`);
      }
    } catch (err) {
      console.error("Stuck run cleanup failed:", err);
    }
  }, CLEANUP_INTERVAL_MS);

  app.addHook("onClose", async () => {
    clearInterval(cleanupInterval);
  });
}

main().catch((err) => {
  console.error("Failed to start API:", err);
  process.exit(1);
});
