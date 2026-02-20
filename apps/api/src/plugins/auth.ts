import fp from "fastify-plugin";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { schema } from "@voiceci/db";

declare module "fastify" {
  interface FastifyInstance {
    verifyApiKey: (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    apiKeyId?: string;
  }
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export const authPlugin = fp(async (app) => {
  app.decorate("verifyApiKey", async (request: any, reply: any) => {
    const header = request.headers["authorization"];
    if (!header || !header.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Missing or invalid Authorization header" });
    }

    const rawKey = header.slice(7);
    const keyHash = hashKey(rawKey);

    const [found] = await app.db
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.key_hash, keyHash))
      .limit(1);

    if (!found) {
      return reply.status(401).send({ error: "Invalid API key" });
    }

    request.apiKeyId = found.id;
  });
});
