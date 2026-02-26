import fp from "fastify-plugin";
import { createHash } from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import { schema } from "@voiceci/db";
import { WorkOS } from "@workos-inc/node";

declare module "fastify" {
  interface FastifyInstance {
    verifyApiKey: (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => Promise<void>;
    verifyAuth: (request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => Promise<void>;
  }
  interface FastifyRequest {
    apiKeyId?: string;
    userId?: string;
    authMethod?: "api_key" | "session";
  }
}

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export const authPlugin = fp(async (app) => {
  const workos = new WorkOS(process.env["WORKOS_API_KEY"]!, {
    clientId: process.env["WORKOS_CLIENT_ID"]!,
  });
  const cookiePassword = process.env["WORKOS_COOKIE_PASSWORD"]!;

  async function verifyAuth(request: any, reply: any) {
    // Path 1: Bearer API key (MCP/CLI)
    const authHeader = request.headers["authorization"];
    if (authHeader?.startsWith("Bearer ")) {
      const rawKey = authHeader.slice(7);
      const keyHash = hashKey(rawKey);

      const [found] = await app.db
        .select()
        .from(schema.apiKeys)
        .where(
          and(
            eq(schema.apiKeys.key_hash, keyHash),
            isNull(schema.apiKeys.revoked_at)
          )
        )
        .limit(1);

      if (!found) {
        return reply.status(401).send({ error: "Invalid API key" });
      }

      request.apiKeyId = found.id;
      request.userId = found.user_id;
      request.authMethod = "api_key";
      return;
    }

    // Path 2: WorkOS sealed session cookie (dashboard)
    const sessionCookie = request.cookies?.["wos-session"];
    if (sessionCookie) {
      try {
        const session = workos.userManagement.loadSealedSession({
          sessionData: sessionCookie,
          cookiePassword,
        });

        const authResult = await session.authenticate();

        if (authResult.authenticated) {
          request.userId = authResult.user.id;
          request.authMethod = "session";
          return;
        }

        // Access token expired — try refreshing via WorkOS API
        const refreshResult = await session.refresh();
        if (refreshResult.authenticated && refreshResult.sealedSession) {
          // Send refreshed cookie back through the proxy
          reply.header(
            "Set-Cookie",
            `wos-session=${refreshResult.sealedSession}; Path=/; HttpOnly; Secure; SameSite=Lax`
          );

          // Re-authenticate with the fresh session
          const fresh = workos.userManagement.loadSealedSession({
            sessionData: refreshResult.sealedSession,
            cookiePassword,
          });
          const freshAuth = await fresh.authenticate();
          if (freshAuth.authenticated) {
            request.userId = freshAuth.user.id;
            request.authMethod = "session";
            return;
          }
        }
      } catch (err: any) {
        console.log("[auth] session error:", err.message);
        // Fall through to 401
      }
    }

    return reply.status(401).send({
      error: "Missing or invalid authentication. Provide a Bearer API key or a valid session cookie.",
    });
  }

  app.decorate("verifyAuth", verifyAuth);
  // Keep verifyApiKey as alias for backward compat with MCP routes
  app.decorate("verifyApiKey", verifyAuth);
});
