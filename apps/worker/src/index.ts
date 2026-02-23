import { Worker } from "bullmq";
import IORedis from "ioredis";
import { executeRun } from "./jobs/run-executor.js";

const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker(
  "voice-ci-runs",
  async (job) => {
    const data = job.data as {
      run_id: string;
      bundle_key: string | null;
      bundle_hash: string | null;
      lockfile_hash?: string | null;
      mode?: string;
      adapter?: string;
      test_spec?: Record<string, unknown>;
      target_phone_number?: string;
      voice_config?: Record<string, unknown>;
      start_command?: string;
      health_endpoint?: string;
      agent_url?: string;
    };

    console.log(`Processing run ${data.run_id} (adapter: ${data.adapter ?? data.mode ?? "unknown"})`);
    await executeRun({
      run_id: data.run_id,
      bundle_key: data.bundle_key,
      bundle_hash: data.bundle_hash,
      lockfile_hash: data.lockfile_hash ?? null,
      mode: data.mode,
      adapter: data.adapter,
      test_spec: data.test_spec,
      target_phone_number: data.target_phone_number,
      voice_config: data.voice_config,
      start_command: data.start_command,
      health_endpoint: data.health_endpoint,
      agent_url: data.agent_url,
    });
  },
  {
    connection,
    concurrency: parseInt(process.env["WORKER_CONCURRENCY"] ?? "20", 10),
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
