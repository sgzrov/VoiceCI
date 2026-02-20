import { execSync } from "node:child_process";
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

  // Load config and scenarios
  const config = loadConfig(WORK_DIR);
  const suite = loadScenarios(WORK_DIR, config.suite);
  console.log(`Loaded suite: ${suite.name} (${suite.scenarios.length} scenarios)`);

  // Install dependencies and start agent
  console.log("Installing dependencies...");
  execSync("npm install", { cwd: WORK_DIR, stdio: "inherit" });

  console.log("Starting agent...");
  const startCmd = config.start_command ?? "npm run start";
  const agentProcess = require("node:child_process").spawn(
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

  try {
    // Wait for agent to be ready
    console.log("Waiting for agent health...");
    await waitForHealth(`${agentUrl}${healthEndpoint}`);
    console.log("Agent is ready");

    // Execute scenarios
    const adapter = createAdapter(config.adapter ?? "http", agentUrl);
    const results = await executeScenarios(suite, adapter);

    // Report results
    await reportResults(runId, results);
    console.log(`Run ${runId} complete`);
  } finally {
    agentProcess.kill("SIGTERM");
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
