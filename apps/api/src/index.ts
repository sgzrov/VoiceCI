import Fastify from "fastify";
import cors from "@fastify/cors";
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
}

main().catch((err) => {
  console.error("Failed to start API:", err);
  process.exit(1);
});
