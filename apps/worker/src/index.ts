import { Worker } from "bullmq";
import IORedis from "ioredis";
import { executeRun } from "./jobs/run-executor.js";

const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker(
  "voice-ci-runs",
  async (job) => {
    const { run_id, bundle_key, bundle_hash, mode } = job.data as {
      run_id: string;
      bundle_key: string;
      bundle_hash: string;
      mode: string;
    };

    console.log(`Processing run ${run_id} (mode: ${mode})`);
    await executeRun({ run_id, bundle_key, bundle_hash, mode });
  },
  {
    connection,
    concurrency: 5,
  }
);

worker.on("completed", (job) => {
  console.log(`Run ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`Run ${job?.id} failed:`, err.message);
});

console.log("VoiceCI Worker started, waiting for jobs...");

process.on("SIGTERM", async () => {
  console.log("Shutting down worker...");
  await worker.close();
  connection.disconnect();
  process.exit(0);
});
