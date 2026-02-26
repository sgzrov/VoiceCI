import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createStorageClient } from "@voiceci/artifacts";

export async function uploadRoutes(app: FastifyInstance) {
  app.post("/uploads/presign", { preHandler: app.verifyAuth }, async (request, reply) => {
    const storage = createStorageClient();
    const bundleKey = `bundles/${request.userId!}/${randomUUID()}.tar.gz`;
    const uploadUrl = await storage.presignUpload(bundleKey);

    return reply.send({
      upload_url: uploadUrl,
      bundle_key: bundleKey,
    });
  });
}
