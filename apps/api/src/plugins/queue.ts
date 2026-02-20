import fp from "fastify-plugin";
import { Queue } from "bullmq";
import IORedis from "ioredis";

declare module "fastify" {
  interface FastifyInstance {
    runQueue: Queue;
  }
}

export const queuePlugin = fp(async (app) => {
  const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  const runQueue = new Queue("voice-ci-runs", { connection });

  app.decorate("runQueue", runQueue);

  app.addHook("onClose", async () => {
    await runQueue.close();
    connection.disconnect();
  });
});
