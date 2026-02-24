import { eq } from "drizzle-orm";
import { createDb, schema, type Database } from "@voiceci/db";
import { createStorageClient } from "@voiceci/artifacts";
import { DEFAULT_TIMEOUT_MS, RUNNER_CALLBACK_HEADER } from "@voiceci/shared";
import type { TestSpec, AudioTestThresholds, AdapterType, VoiceConfig } from "@voiceci/shared";
import type { AudioChannelConfig } from "@voiceci/adapters";
import { executeTests } from "@voiceci/runner/executor";
import { createMachine, waitForMachine, destroyMachine } from "../fly-machines.js";

interface RunJob {
  run_id: string;
  bundle_key: string | null;
  bundle_hash: string | null;
  lockfile_hash: string | null;
  adapter?: string;
  test_spec?: Record<string, unknown>;
  target_phone_number?: string;
  voice_config?: Record<string, unknown>;
  audio_test_thresholds?: Record<string, unknown> | null;
  start_command?: string;
  health_endpoint?: string;
  agent_url?: string;
}

// ---------------------------------------------------------------------------
// Image resolution: check for prebaked dep image, spawn builder if needed
// ---------------------------------------------------------------------------

async function resolveImage(
  db: Database,
  lockfileHash: string | null,
  bundleDownloadUrl: string | undefined,
  baseImage: string,
  appName: string,
  region: string,
  callbackSecret: string,
  apiUrl: string,
): Promise<string> {
  if (!lockfileHash || !bundleDownloadUrl) {
    return baseImage;
  }

  const imageRef = `registry.fly.io/voiceci-runner:deps-${lockfileHash.slice(0, 16)}`;

  // Check if prebaked image exists
  const [existing] = await db
    .select()
    .from(schema.depImages)
    .where(eq(schema.depImages.lockfile_hash, lockfileHash))
    .limit(1);

  if (existing) {
    if (existing.status === "ready") {
      // Check if base image changed (stale prebake)
      if (existing.base_image_ref && existing.base_image_ref !== baseImage) {
        console.log("dep-image: base image changed, rebuilding");
        await db
          .delete(schema.depImages)
          .where(eq(schema.depImages.lockfile_hash, lockfileHash));
        // Fall through to build
      } else {
        console.log(`dep-image: cache hit for ${lockfileHash.slice(0, 12)}, using ${existing.image_ref}`);
        return existing.image_ref;
      }
    } else if (existing.status === "building") {
      console.log(`dep-image: build in progress for ${lockfileHash.slice(0, 12)}, waiting...`);
      return waitForDepImage(db, lockfileHash, baseImage);
    } else {
      // Failed — fall back to base image
      console.log(`dep-image: previous build failed for ${lockfileHash.slice(0, 12)}, using base image`);
      return baseImage;
    }
  }

  // Try to claim the build
  try {
    const [inserted] = await db
      .insert(schema.depImages)
      .values({
        lockfile_hash: lockfileHash,
        image_ref: imageRef,
        base_image_ref: baseImage,
        status: "building",
      })
      .onConflictDoNothing({ target: schema.depImages.lockfile_hash })
      .returning();

    if (!inserted) {
      // Another worker claimed it between our SELECT and INSERT
      console.log("dep-image: build claimed by another worker, waiting...");
      return waitForDepImage(db, lockfileHash, baseImage);
    }

    // We own the build — spawn builder machine
    console.log(`dep-image: spawning builder for ${lockfileHash.slice(0, 12)}`);

    const builderEnv: Record<string, string> = {
      LOCKFILE_HASH: lockfileHash,
      BUNDLE_DOWNLOAD_URL: bundleDownloadUrl,
      IMAGE_REF: imageRef,
      BASE_IMAGE: baseImage,
      BUILDER_CALLBACK_URL: `${apiUrl}/internal/dep-image-callback`,
      RUNNER_CALLBACK_SECRET: callbackSecret,
      FLY_API_TOKEN: process.env["FLY_API_TOKEN"]!,
    };

    const builderId = await createMachine({
      appName,
      image: baseImage,
      region,
      env: builderEnv,
      memoryMb: 2048,
      initCmd: ["node", "apps/runner/dist/builder.js"],
    });

    await db
      .update(schema.depImages)
      .set({ builder_machine_id: builderId })
      .where(eq(schema.depImages.lockfile_hash, lockfileHash));

    console.log(`dep-image: builder machine ${builderId} spawned`);

    // Wait for builder to complete
    try {
      await waitForMachine(appName, builderId, 300_000);
    } catch (err) {
      console.error("dep-image: builder timed out or failed:", err);
      await db
        .update(schema.depImages)
        .set({
          status: "failed",
          error_text: err instanceof Error ? err.message : "Builder timeout",
        })
        .where(eq(schema.depImages.lockfile_hash, lockfileHash));
      return baseImage;
    }

    // Builder exited — check if it succeeded
    const [result] = await db
      .select()
      .from(schema.depImages)
      .where(eq(schema.depImages.lockfile_hash, lockfileHash))
      .limit(1);

    if (result?.status === "ready") {
      console.log(`dep-image: build complete, using ${result.image_ref}`);
      return result.image_ref;
    }

    // Builder exited without calling back
    if (result?.status === "building") {
      await db
        .update(schema.depImages)
        .set({ status: "failed", error_text: "Builder exited without reporting" })
        .where(eq(schema.depImages.lockfile_hash, lockfileHash));
    }

    console.log(`dep-image: builder exited but status=${result?.status}, using base image`);
    return baseImage;
  } catch (err) {
    console.error("dep-image: failed to resolve image:", err);
    return baseImage;
  }
}

async function waitForDepImage(
  db: Database,
  lockfileHash: string,
  baseImage: string,
): Promise<string> {
  const deadline = Date.now() + 300_000;

  while (Date.now() < deadline) {
    const [record] = await db
      .select()
      .from(schema.depImages)
      .where(eq(schema.depImages.lockfile_hash, lockfileHash))
      .limit(1);

    if (!record) return baseImage;
    if (record.status === "ready") return record.image_ref;
    if (record.status === "failed") return baseImage;

    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }

  console.warn("dep-image: timed out waiting for builder, using base image");
  return baseImage;
}

// ---------------------------------------------------------------------------
// Direct execution for already-deployed agents (SIP, WebRTC, agent_url)
// ---------------------------------------------------------------------------

async function executeRemoteRun(db: Database, job: RunJob): Promise<void> {
  const apiUrl = process.env["API_URL"] ?? "https://voiceci-api.fly.dev";
  const callbackSecret = process.env["RUNNER_CALLBACK_SECRET"] ?? "";
  const callbackUrl = `${apiUrl}/internal/runner-callback`;

  const adapterType = (job.adapter ?? "ws-voice") as AdapterType;
  const agentUrl = job.agent_url ?? "http://localhost:3001";

  // Parse voice config
  let voiceConfig: VoiceConfig | undefined;
  if (job.voice_config) {
    voiceConfig = (job.voice_config as { voice?: VoiceConfig }).voice ?? undefined;
  }

  // Parse audio test thresholds
  const audioTestThresholds = job.audio_test_thresholds as AudioTestThresholds | undefined;

  const channelConfig: AudioChannelConfig = {
    adapter: adapterType,
    agentUrl,
    targetPhoneNumber: job.target_phone_number,
    voice: voiceConfig,
  };

  const testSpec = job.test_spec as TestSpec;

  try {
    const { status, audioResults, conversationResults, aggregate } = await executeTests({
      testSpec,
      channelConfig,
      audioTestThresholds,
    });

    // POST results to callback (stores in DB + triggers SSE push)
    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [RUNNER_CALLBACK_HEADER]: callbackSecret,
      },
      body: JSON.stringify({
        run_id: job.run_id,
        status,
        audio_results: audioResults,
        conversation_results: conversationResults,
        aggregate,
      }),
    });

    if (!response.ok) {
      throw new Error(`Callback failed: ${response.status} ${await response.text()}`);
    }

    console.log(`Remote run ${job.run_id} completed: ${status}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`Remote run ${job.run_id} failed:`, errorMessage);

    await db
      .update(schema.runs)
      .set({
        status: "fail",
        finished_at: new Date(),
        error_text: errorMessage,
      })
      .where(eq(schema.runs.id, job.run_id));
  }
}

// ---------------------------------------------------------------------------
// Main run executor
// ---------------------------------------------------------------------------

export async function executeRun(job: RunJob): Promise<void> {
  const db = createDb(process.env["DATABASE_URL"]!);

  await db
    .update(schema.runs)
    .set({ status: "running", started_at: new Date() })
    .where(eq(schema.runs.id, job.run_id));

  // Already-deployed agents: run tests directly in worker process
  const isRemote = job.adapter === "sip" || job.adapter === "webrtc" || !!job.agent_url;
  if (isRemote) {
    return executeRemoteRun(db, job);
  }

  // Bundled agents: provision a Fly Machine
  const appName = process.env["FLY_APP_NAME"] ?? "voiceci-runner";
  const region = process.env["FLY_REGION"] ?? "iad";
  const baseImage = process.env["RUNNER_IMAGE"] ?? "registry.fly.io/voiceci-runner:latest";
  const apiUrl = process.env["API_URL"] ?? "https://voiceci-api.fly.dev";
  const callbackSecret = process.env["RUNNER_CALLBACK_SECRET"] ?? "";

  let machineId: string | undefined;

  try {
    // S3/R2 credentials — needed for bundle download AND audio artifact uploads
    const endpoint = (process.env["S3_ENDPOINT"] ?? process.env["R2_ENDPOINT"] ?? "").replace(/\/+$/, "");
    const bucket = process.env["S3_BUCKET"] ?? process.env["R2_BUCKET"] ?? "";
    const accessKeyId = process.env["S3_ACCESS_KEY_ID"] ?? process.env["R2_ACCESS_KEY_ID"] ?? "";
    const secretAccessKey = process.env["S3_SECRET_ACCESS_KEY"] ?? process.env["R2_SECRET_ACCESS_KEY"] ?? "";

    // Generate presigned download URL for bundle (only if bundle exists)
    let bundleDownloadUrl: string | undefined;
    if (job.bundle_key) {
      console.log(`S3 config: endpoint=${endpoint}, bucket=${bucket}, keyId=${accessKeyId ? accessKeyId.slice(0, 6) + "..." : "EMPTY"}`);

      const storage = createStorageClient({
        endpoint,
        bucket,
        accessKeyId,
        secretAccessKey,
        region: "auto",
      });
      bundleDownloadUrl = await storage.presignDownload(job.bundle_key);
      console.log(`Presigned URL for ${job.bundle_key}: ${bundleDownloadUrl}`);
    } else {
      console.log("No bundle_key — remote agent, skipping presign");
    }

    // Resolve image: use prebaked dep image if available, otherwise base
    const resolvedImage = await resolveImage(
      db,
      job.lockfile_hash,
      bundleDownloadUrl,
      baseImage,
      appName,
      region,
      callbackSecret,
      apiUrl,
    );

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
      "ANTHROPIC_API_KEY",
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

    // Forward test spec and adapter config as JSON
    const configEnv: Record<string, string> = {};
    if (job.voice_config) {
      configEnv["VOICE_CONFIG_JSON"] = JSON.stringify(job.voice_config);
    }
    if (job.audio_test_thresholds) {
      configEnv["AUDIO_TEST_THRESHOLDS_JSON"] = JSON.stringify(job.audio_test_thresholds);
    }
    if (job.test_spec) {
      configEnv["TEST_SPEC_JSON"] = JSON.stringify(job.test_spec);
    }
    if (job.adapter) {
      configEnv["ADAPTER_TYPE"] = job.adapter;
    }
    if (job.target_phone_number) {
      configEnv["TARGET_PHONE_NUMBER"] = job.target_phone_number;
    }
    if (job.start_command) {
      configEnv["START_COMMAND"] = job.start_command;
    }
    if (job.health_endpoint) {
      configEnv["HEALTH_ENDPOINT"] = job.health_endpoint;
    }
    if (job.agent_url) {
      configEnv["AGENT_URL"] = job.agent_url;
    }

    const machineEnv: Record<string, string> = {
      RUN_ID: job.run_id,
      API_CALLBACK_URL: `${apiUrl}/internal/runner-callback`,
      RUNNER_CALLBACK_SECRET: callbackSecret,
      ...voiceEnv,
      ...storageEnv,
      ...configEnv,
    };
    if (job.bundle_key) machineEnv["BUNDLE_KEY"] = job.bundle_key;
    if (job.bundle_hash) machineEnv["BUNDLE_HASH"] = job.bundle_hash;
    if (bundleDownloadUrl) machineEnv["BUNDLE_DOWNLOAD_URL"] = bundleDownloadUrl;

    // Dynamic machine sizing based on total test count
    const testCount =
      (Array.isArray(job.test_spec?.audio_tests) ? (job.test_spec.audio_tests as unknown[]).length : 0) +
      (Array.isArray(job.test_spec?.conversation_tests) ? (job.test_spec.conversation_tests as unknown[]).length : 0);

    let cpuKind = "shared";
    let cpus = 1;
    let memoryMb = 1024;

    if (testCount > 12) {
      cpuKind = "performance";
      cpus = 4;
      memoryMb = 4096;
    } else if (testCount > 6) {
      cpuKind = "performance";
      cpus = 2;
      memoryMb = 2048;
    }

    machineId = await createMachine({
      appName,
      image: resolvedImage,
      region,
      env: machineEnv,
      cpuKind,
      cpus,
      memoryMb,
    });

    console.log(`Machine ${machineId} created for run ${job.run_id} (image: ${resolvedImage})`);

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
