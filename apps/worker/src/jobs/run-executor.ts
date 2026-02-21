import { eq } from "drizzle-orm";
import { createDb, schema } from "@voiceci/db";
import { createStorageClient } from "@voiceci/artifacts";
import { DEFAULT_TIMEOUT_MS } from "@voiceci/shared";
import { createMachine, waitForMachine, destroyMachine } from "../fly-machines.js";

interface RunJob {
  run_id: string;
  bundle_key: string;
  bundle_hash: string;
  mode: string;
  voice_config?: Record<string, unknown>;
}

export async function executeRun(job: RunJob): Promise<void> {
  const db = createDb(process.env["DATABASE_URL"]!);

  await db
    .update(schema.runs)
    .set({ status: "running", started_at: new Date() })
    .where(eq(schema.runs.id, job.run_id));

  const appName = process.env["FLY_APP_NAME"] ?? "voiceci-runner";
  const region = process.env["FLY_REGION"] ?? "iad";
  const image = process.env["RUNNER_IMAGE"] ?? "registry.fly.io/voiceci-runner:latest";
  const apiUrl = process.env["API_URL"] ?? "https://voiceci-api.fly.dev";
  const callbackSecret = process.env["RUNNER_CALLBACK_SECRET"] ?? "";

  let machineId: string | undefined;

  try {
    // Generate presigned download URL in the worker (which has R2 credentials)
    // so the runner doesn't need S3 credentials at all
    const endpoint = (process.env["S3_ENDPOINT"] ?? process.env["R2_ENDPOINT"] ?? "").replace(/\/+$/, "");
    const bucket = process.env["S3_BUCKET"] ?? process.env["R2_BUCKET"] ?? "";
    const accessKeyId = process.env["S3_ACCESS_KEY_ID"] ?? process.env["R2_ACCESS_KEY_ID"] ?? "";
    const secretAccessKey = process.env["S3_SECRET_ACCESS_KEY"] ?? process.env["R2_SECRET_ACCESS_KEY"] ?? "";

    console.log(`S3 config: endpoint=${endpoint}, bucket=${bucket}, keyId=${accessKeyId ? accessKeyId.slice(0, 6) + "..." : "EMPTY"}`);

    const storage = createStorageClient({
      endpoint,
      bucket,
      accessKeyId,
      secretAccessKey,
      region: "auto",
    });
    const bundleDownloadUrl = await storage.presignDownload(job.bundle_key);
    console.log(`Presigned URL for ${job.bundle_key}: ${bundleDownloadUrl}`);

    // Forward voice-related API keys to the runner machine (if set on worker)
    const voiceEnv: Record<string, string> = {};
    const voiceKeys = [
      "ELEVENLABS_API_KEY",
      "DEEPGRAM_API_KEY",
      "PLIVO_AUTH_ID",
      "PLIVO_AUTH_TOKEN",
      "LIVEKIT_URL",
      "LIVEKIT_API_KEY",
      "LIVEKIT_API_SECRET",
    ];
    for (const key of voiceKeys) {
      if (process.env[key]) {
        voiceEnv[key] = process.env[key]!;
      }
    }

    // Forward S3 credentials so runner can upload audio artifacts
    const storageEnv: Record<string, string> = {
      S3_ENDPOINT: endpoint,
      S3_BUCKET: bucket,
      S3_ACCESS_KEY_ID: accessKeyId,
      S3_SECRET_ACCESS_KEY: secretAccessKey,
      S3_REGION: "auto",
    };

    // Forward MCP voice config overrides as JSON (if provided)
    const configEnv: Record<string, string> = {};
    if (job.voice_config) {
      configEnv["VOICE_CONFIG_JSON"] = JSON.stringify(job.voice_config);
    }

    machineId = await createMachine({
      appName,
      image,
      region,
      env: {
        RUN_ID: job.run_id,
        BUNDLE_KEY: job.bundle_key,
        BUNDLE_HASH: job.bundle_hash,
        MODE: job.mode,
        BUNDLE_DOWNLOAD_URL: bundleDownloadUrl,
        API_CALLBACK_URL: `${apiUrl}/internal/runner-callback`,
        RUNNER_CALLBACK_SECRET: callbackSecret,
        ...voiceEnv,
        ...storageEnv,
        ...configEnv,
      },
      memoryMb: 1024,
    });

    console.log(`Machine ${machineId} created for run ${job.run_id}`);

    const timeoutMs = parseInt(
      process.env["RUNNER_TIMEOUT_MS"] ?? String(DEFAULT_TIMEOUT_MS),
      10
    );

    await waitForMachine(appName, machineId, timeoutMs);
    console.log(`Machine ${machineId} finished for run ${job.run_id}`);
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";
    console.error(`Run ${job.run_id} failed:`, errorMessage);

    await db
      .update(schema.runs)
      .set({
        status: "fail",
        finished_at: new Date(),
        error_text: errorMessage,
      })
      .where(eq(schema.runs.id, job.run_id));

    if (machineId) {
      await destroyMachine(appName, machineId).catch(() => {});
    }
  }
}
