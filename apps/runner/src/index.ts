import { execSync, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import type { TestSpec, AudioTestResult, ConversationTestResult, RunAggregateV2, AdapterType, VoiceConfig } from "@voiceci/shared";
import { createAudioChannel, type AudioChannelConfig } from "@voiceci/adapters";
import { runAudioTest } from "./audio-tests/index.js";
import { runConversationTest } from "./conversation/index.js";
import { reportResults } from "./reporter.js";
import { waitForHealth } from "./health-check.js";

const WORK_DIR = "/work";

async function main() {
  const runId = requireEnv("RUN_ID");
  const bundleDownloadUrl = requireEnv("BUNDLE_DOWNLOAD_URL");
  const testSpec = JSON.parse(requireEnv("TEST_SPEC_JSON")) as TestSpec;
  const adapterType = (process.env["ADAPTER_TYPE"] ?? "ws-voice") as AdapterType;

  console.log(`Runner starting for run ${runId}`);

  // Download and extract bundle
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

  // Parse voice config from env
  let voiceConfig: VoiceConfig | undefined;
  const voiceConfigJson = process.env["VOICE_CONFIG_JSON"];
  if (voiceConfigJson) {
    const parsed = JSON.parse(voiceConfigJson) as Record<string, unknown>;
    voiceConfig = (parsed.voice as VoiceConfig) ?? undefined;
  }

  // For remote agents (SIP/WebRTC), skip local agent startup
  const isRemoteAgent = adapterType === "sip" || adapterType === "webrtc";
  let agentProcess: ChildProcess | null = null;
  const agentUrl = process.env["AGENT_URL"] ?? "http://localhost:3001";

  if (!isRemoteAgent) {
    console.log("Installing dependencies...");
    execSync("npm install", { cwd: WORK_DIR, stdio: "inherit" });

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

  const audioResults: AudioTestResult[] = [];
  const conversationResults: ConversationTestResult[] = [];

  try {
    // Run audio tests
    if (testSpec.audio_tests && testSpec.audio_tests.length > 0) {
      console.log(`Running ${testSpec.audio_tests.length} audio tests...`);
      for (const testName of testSpec.audio_tests) {
        console.log(`  Audio test: ${testName}`);
        const channel = createAudioChannel(channelConfig);
        try {
          await channel.connect();
          const result = await runAudioTest(testName, channel);
          audioResults.push(result);
          console.log(`    ${testName}: ${result.status} (${result.duration_ms}ms)`);
        } finally {
          await channel.disconnect().catch(() => {});
        }
      }
    }

    // Run conversation tests
    if (testSpec.conversation_tests && testSpec.conversation_tests.length > 0) {
      console.log(`Running ${testSpec.conversation_tests.length} conversation tests...`);
      for (const spec of testSpec.conversation_tests) {
        console.log(`  Conversation: ${spec.caller_prompt.slice(0, 60)}...`);
        const channel = createAudioChannel(channelConfig);
        try {
          await channel.connect();
          const result = await runConversationTest(spec, channel);
          conversationResults.push(result);
          console.log(`    Status: ${result.status} (${result.duration_ms}ms)`);
        } finally {
          await channel.disconnect().catch(() => {});
        }
      }
    }

    // Aggregate results
    const audioPassed = audioResults.filter((r) => r.status === "pass").length;
    const audioFailed = audioResults.filter((r) => r.status === "fail").length;
    const convPassed = conversationResults.filter((r) => r.status === "pass").length;
    const convFailed = conversationResults.filter((r) => r.status === "fail").length;

    const totalDurationMs =
      audioResults.reduce((sum, r) => sum + r.duration_ms, 0) +
      conversationResults.reduce((sum, r) => sum + r.duration_ms, 0);

    const aggregate: RunAggregateV2 = {
      audio_tests: {
        total: audioResults.length,
        passed: audioPassed,
        failed: audioFailed,
      },
      conversation_tests: {
        total: conversationResults.length,
        passed: convPassed,
        failed: convFailed,
      },
      total_duration_ms: totalDurationMs,
    };

    const overallStatus = audioFailed + convFailed === 0 ? "pass" : "fail";

    console.log(
      `Run complete: ${overallStatus} (audio: ${audioPassed}/${audioResults.length}, conversation: ${convPassed}/${conversationResults.length})`
    );

    await reportResults({
      run_id: runId,
      status: overallStatus,
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
