import { RUNNER_CALLBACK_HEADER } from "@voiceci/shared";
import type { ExecutionResults } from "./executor.js";

export async function reportResults(
  runId: string,
  results: ExecutionResults
): Promise<void> {
  const callbackUrl = process.env["API_CALLBACK_URL"];
  if (!callbackUrl) {
    throw new Error("API_CALLBACK_URL is required");
  }

  const secret = process.env["RUNNER_CALLBACK_SECRET"] ?? "";

  const payload = {
    run_id: runId,
    status: results.status,
    scenario_results: results.scenario_results,
    aggregate: results.aggregate,
  };

  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [RUNNER_CALLBACK_HEADER]: secret,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to report results: ${response.status} ${text}`);
  }

  console.log("Results reported successfully");
}
