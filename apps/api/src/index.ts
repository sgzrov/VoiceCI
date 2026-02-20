import Fastify from "fastify";
import cors from "@fastify/cors";
import { healthRoutes } from "./routes/health.js";
import { uploadRoutes } from "./routes/uploads.js";
import { runRoutes } from "./routes/runs.js";
import { callbackRoutes } from "./routes/callback.js";
import { mcpRoutes } from "./routes/mcp.js";
import { dbPlugin } from "./plugins/db.js";
import { queuePlugin } from "./plugins/queue.js";

const port = parseInt(process.env["API_PORT"] ?? "3000", 10);
const host = process.env["API_HOST"] ?? "0.0.0.0";

async function main() {
  const app = Fastify({
    logger: {
      level: "info",
    },
  });

  await app.register(cors, { origin: true });
  await app.register(dbPlugin);
  await app.register(queuePlugin);
  await app.register(healthRoutes);
  await app.register(uploadRoutes);
  await app.register(runRoutes);
  await app.register(callbackRoutes);
  await app.register(mcpRoutes);

  await app.listen({ port, host });
  console.log(`VoiceCI API listening on ${host}:${port}`);
}

main().catch((err) => {
  console.error("Failed to start API:", err);
  process.exit(1);
});
