import { DEFAULT_POLL_INTERVAL_MS } from "@voiceci/shared";
import type { Run } from "@voiceci/shared";

export async function pollRun(
  apiUrl: string,
  runId: string,
  intervalMs: number = DEFAULT_POLL_INTERVAL_MS,
  timeoutMs: number = 600_000
): Promise<Run> {
  const { default: ora } = await import("ora");
  const { default: chalk } = await import("chalk");
  const debug = (msg: string) => console.error(chalk.dim(`[debug] ${msg}`));
  const spinner = ora("Waiting for results...").start();
  const deadline = Date.now() + timeoutMs;
  let pollCount = 0;

  while (Date.now() < deadline) {
    pollCount++;
    const response = await fetch(`${apiUrl}/runs/${runId}`);
    if (!response.ok) {
      throw new Error(`Failed to poll run: ${response.status}`);
    }

    const run = (await response.json()) as Run;

    if (pollCount <= 5 || pollCount % 10 === 0) {
      debug(`poll #${pollCount}: status=${run.status} error=${run.error_text ?? "none"}`);
    }

    switch (run.status) {
      case "queued":
        spinner.text = `Queued, waiting for runner... (poll #${pollCount})`;
        break;
      case "running":
        spinner.text = `Running scenarios... (poll #${pollCount})`;
        break;
      case "pass":
      case "fail":
        spinner.stop();
        debug(`final status: ${run.status} after ${pollCount} polls`);
        return run;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  spinner.fail("Run timed out");
  throw new Error(`Run ${runId} timed out after ${timeoutMs}ms`);
}
