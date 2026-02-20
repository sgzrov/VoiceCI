import { createBundle } from "../bundler.js";
import { uploadBundle } from "../uploader.js";
import { pollRun } from "../poller.js";
import { printSummary } from "../output.js";
import type { PresignResponse, Run } from "@voiceci/shared";

interface RunOptions {
  mode: string;
  apiUrl: string;
}

export async function runCommand(options: RunOptions) {
  const { default: ora } = await import("ora");
  const { default: chalk } = await import("chalk");

  const debug = (msg: string) => console.error(chalk.dim(`[debug] ${msg}`));

  console.log(chalk.bold("\n  VoiceCI\n"));
  debug(`api-url: ${options.apiUrl}`);
  debug(`mode: ${options.mode}`);
  debug(`cwd: ${process.cwd()}`);

  // Step 1: Bundle
  const spinner = ora("Creating bundle...").start();
  const { filePath, hash, size } = await createBundle(process.cwd());
  spinner.succeed(`Bundle created (${formatBytes(size)}, hash: ${hash.slice(0, 12)}...)`);
  debug(`bundle path: ${filePath}`);

  // Step 2: Get presigned URL
  spinner.start("Requesting upload URL...");
  debug(`POST ${options.apiUrl}/uploads/presign`);
  const presignRes = await fetch(`${options.apiUrl}/uploads/presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  debug(`presign response: ${presignRes.status}`);

  if (!presignRes.ok) {
    const errText = await presignRes.text();
    spinner.fail(`Failed to get upload URL: ${presignRes.status}`);
    debug(`presign error body: ${errText}`);
    process.exit(1);
  }

  const { upload_url, bundle_key } = (await presignRes.json()) as PresignResponse;
  spinner.succeed("Upload URL received");
  debug(`bundle_key: ${bundle_key}`);
  debug(`upload_url host: ${new URL(upload_url).host}`);

  // Step 3: Upload
  spinner.start("Uploading bundle...");
  debug(`PUT ${size} bytes to R2`);
  await uploadBundle(filePath, upload_url);
  spinner.succeed("Bundle uploaded");

  // Step 4: Create run
  spinner.start("Creating run...");
  const runBody = {
    source_type: "bundle",
    bundle_key,
    bundle_hash: hash,
    mode: options.mode,
  };
  debug(`POST ${options.apiUrl}/runs body: ${JSON.stringify(runBody)}`);
  const runRes = await fetch(`${options.apiUrl}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(runBody),
  });
  debug(`create run response: ${runRes.status}`);

  if (!runRes.ok) {
    const errText = await runRes.text();
    spinner.fail(`Failed to create run: ${runRes.status}`);
    debug(`create run error body: ${errText}`);
    process.exit(1);
  }

  const run = (await runRes.json()) as Run;
  spinner.succeed(`Run created: ${run.id}`);
  debug(`run: ${JSON.stringify(run)}`);

  // Step 5: Poll for results
  console.log("");
  const finalRun = await pollRun(options.apiUrl, run.id);

  // Step 6: Print summary
  printSummary(finalRun);

  // Exit with appropriate code
  process.exit(finalRun.status === "pass" ? 0 : 1);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
