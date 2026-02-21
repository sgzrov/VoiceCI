import { execSync, type ChildProcess } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { loadConfig } from "@voiceci/config";
import { loadScenarios } from "@voiceci/scenarios";
import { createAdapter } from "@voiceci/adapters";
import { executeScenarios } from "./executor.js";
import { waitForHealth } from "./health-check.js";
import { reportResults } from "./reporter.js";

const WORK_DIR = "/work";

async function main() {
  const runId = requireEnv("RUN_ID");
  const bundleDownloadUrl = requireEnv("BUNDLE_DOWNLOAD_URL");

  console.log(`Runner starting for run ${runId}`);

  // Download and extract bundle using presigned URL from worker
  mkdirSync(WORK_DIR, { recursive: true });

  console.log("Downloading bundle...");
  const response = await fetch(bundleDownloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to download bundle: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/tmp/bundle.tar.gz", Buffer.from(arrayBuffer));

  console.log("Extracting bundle...");
  execSync(`tar -xzf /tmp/bundle.tar.gz -C ${WORK_DIR}`, { stdio: "inherit" });

  // Load config and scenarios, merging MCP voice overrides if provided
  const config = loadConfig(WORK_DIR);
  const voiceConfigJson = process.env["VOICE_CONFIG_JSON"];
  if (voiceConfigJson) {
    const overrides = JSON.parse(voiceConfigJson) as Record<string, unknown>;
    if (overrides.adapter) config.adapter = overrides.adapter as string;
    if (overrides.target_phone_number)
      config.target_phone_number = overrides.target_phone_number as string;
    if (overrides.voice)
      config.voice = { ...config.voice, ...(overrides.voice as typeof config.voice) };
  }
  const suite = loadScenarios(WORK_DIR, config.suite);
  console.log(`Loaded suite: ${suite.name} (${suite.scenarios.length} scenarios)`);

  // For remote agents (SIP/WebRTC), skip local agent startup
  const isRemoteAgent =
    config.adapter === "sip" || config.adapter === "webrtc";

  let agentProcess: ChildProcess | null = null;

  if (!isRemoteAgent) {
    // Install dependencies and start agent
    console.log("Installing dependencies...");
    execSync("npm install", { cwd: WORK_DIR, stdio: "inherit" });

    console.log("Starting agent...");
    const startCmd = config.start_command ?? "npm run start";
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

    const agentUrl = config.agent_url ?? "http://localhost:3001";
    const healthEndpoint = config.health_endpoint ?? "/health";

    console.log("Waiting for agent health...");
    await waitForHealth(`${agentUrl}${healthEndpoint}`);
    console.log("Agent is ready");
  } else {
    console.log(`Using remote agent (${config.adapter} adapter)`);
  }

  try {
    // Execute scenarios
    const adapter = createAdapter(config);
    const results = await executeScenarios(suite, adapter, runId);

    // Disconnect voice adapters if they have a disconnect method
    if ("disconnect" in adapter && typeof adapter.disconnect === "function") {
      await (adapter as { disconnect: () => Promise<void> }).disconnect();
    }

    // Report results
    await reportResults(runId, results);
    console.log(`Run ${runId} complete`);
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
