import fp from "fastify-plugin";
import { Queue } from "bullmq";
import IORedis from "ioredis";

declare module "fastify" {
  interface FastifyInstance {
    getRunQueue: (apiKeyId: string) => Queue;
  }
}

export const queuePlugin = fp(async (app) => {
  const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

  const queues = new Map<string, Queue>();

  app.decorate("getRunQueue", (apiKeyId: string) => {
    const name = `voice-ci-runs:${apiKeyId}`;
    if (!queues.has(name)) {
      const q = new Queue(name, { connection });
      queues.set(name, q);
      // Notify worker of new queue via Redis Set + pub/sub
      void connection.sadd("voiceci:active-queues", name);
      void connection.publish("voiceci:new-queue", name);
    }
    return queues.get(name)!;
  });

  app.addHook("onClose", async () => {
    for (const q of queues.values()) {
      await q.close();
    }
    connection.disconnect();
  });
});
