import type { FastifyInstance } from "fastify";
import { randomBytes, createHash } from "node:crypto";
import { schema } from "@voiceci/db";

export async function keyRoutes(app: FastifyInstance) {
  app.post("/keys", async (request, reply) => {
    const body = request.body as { name?: string } | undefined;
    const name = body?.name ?? "default";

    // Generate a random API key with a voiceci_ prefix
    const rawKey = `voiceci_${randomBytes(24).toString("hex")}`;
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    await app.db.insert(schema.apiKeys).values({
      key_hash: keyHash,
      name,
    });

    // Return the raw key once — it can never be retrieved again
    return reply.send({
      api_key: rawKey,
      name,
      warning: "Save this key — it will not be shown again.",
    });
  });
}
