import { execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TestSpec, AdapterType, VoiceConfig, AudioTestThresholds } from "@voiceci/shared";
import type { AudioChannelConfig } from "@voiceci/adapters";
import { executeTests } from "./executor.js";
import { reportResults } from "./reporter.js";
import { waitForHealth } from "./health-check.js";

const WORK_DIR = "/work";

async function main() {
  const runId = requireEnv("RUN_ID");
  const bundleDownloadUrl = process.env["BUNDLE_DOWNLOAD_URL"];
  const testSpec = JSON.parse(requireEnv("TEST_SPEC_JSON")) as TestSpec;
  const adapterType = (process.env["ADAPTER_TYPE"] ?? "ws-voice") as AdapterType;

  console.log(`Runner starting for run ${runId}`);

  // Download and extract bundle (only needed for local agents)
  if (bundleDownloadUrl) {
    mkdirSync(WORK_DIR, { recursive: true });

    console.log("Downloading bundle...");
    const response = await fetch(bundleDownloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to download bundle: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    writeFileSync("/tmp/bundle.tar.gz", Buffer.from(arrayBuffer));

    console.log("Extracting bundle...");
    execSync(`tar -xzf /tmp/bundle.tar.gz -C ${WORK_DIR}`, { stdio: "inherit" });
  }

  // Parse voice config from env
  let voiceConfig: VoiceConfig | undefined;
  const voiceConfigJson = process.env["VOICE_CONFIG_JSON"];
  if (voiceConfigJson) {
    const parsed = JSON.parse(voiceConfigJson) as Record<string, unknown>;
    voiceConfig = (parsed.voice as VoiceConfig) ?? undefined;
  }

  // Parse audio test thresholds from env
  let audioTestThresholds: AudioTestThresholds | undefined;
  const thresholdsJson = process.env["AUDIO_TEST_THRESHOLDS_JSON"];
  if (thresholdsJson) {
    audioTestThresholds = JSON.parse(thresholdsJson) as AudioTestThresholds;
  }

  // For remote agents (SIP/WebRTC), skip local agent startup
  const isRemoteAgent = adapterType === "sip" || adapterType === "webrtc";
  let agentProcess: ChildProcess | null = null;
  const agentUrl = process.env["AGENT_URL"] ?? "http://localhost:3001";

  if (!isRemoteAgent) {
    if (existsSync(join(WORK_DIR, "node_modules"))) {
      console.log("node_modules present (prebaked image), skipping install");
    } else {
      console.log("Installing dependencies...");
      execSync("npm install", { cwd: WORK_DIR, stdio: "inherit" });
    }

    console.log("Starting agent...");
    const startCmd = process.env["START_COMMAND"] ?? "npm run start";
    agentProcess = require("node:child_process").spawn(
      startCmd.split(" ")[0]!,
      startCmd.split(" ").slice(1),
      {
        cwd: WORK_DIR,
        stdio: "pipe",
        env: { ...process.env, PORT: "3001" },
        shell: true,
      }
    );

    const healthEndpoint = process.env["HEALTH_ENDPOINT"] ?? "/health";
    console.log("Waiting for agent health...");
    await waitForHealth(`${agentUrl}${healthEndpoint}`);
    console.log("Agent is ready");
  } else {
    console.log(`Using remote agent (${adapterType} adapter)`);
  }

  const channelConfig: AudioChannelConfig = {
    adapter: adapterType,
    agentUrl,
    targetPhoneNumber: process.env["TARGET_PHONE_NUMBER"],
    voice: voiceConfig,
  };

  try {
    const { status, audioResults, conversationResults, aggregate } = await executeTests({
      testSpec,
      channelConfig,
      audioTestThresholds,
    });

    await reportResults({
      run_id: runId,
      status,
      audio_results: audioResults,
      conversation_results: conversationResults,
      aggregate,
    });
  } finally {
    agentProcess?.kill("SIGTERM");
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env: ${key}`);
  return value;
}

main().catch((err) => {
  console.error("Runner failed:", err);
  process.exit(1);
});
