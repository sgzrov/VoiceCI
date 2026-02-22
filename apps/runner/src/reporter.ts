import { RUNNER_CALLBACK_HEADER } from "@voiceci/shared";
import type { AudioTestResult, ConversationTestResult, RunAggregateV2 } from "@voiceci/shared";

export interface RunResults {
  run_id: string;
  status: "pass" | "fail";
  audio_results: AudioTestResult[];
  conversation_results: ConversationTestResult[];
  aggregate: RunAggregateV2;
  error_text?: string;
}

export async function reportResults(results: RunResults): Promise<void> {
  const callbackUrl = process.env["API_CALLBACK_URL"];
  if (!callbackUrl) {
    throw new Error("API_CALLBACK_URL is required");
  }

  const secret = process.env["RUNNER_CALLBACK_SECRET"] ?? "";

  const response = await fetch(callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [RUNNER_CALLBACK_HEADER]: secret,
    },
    body: JSON.stringify(results),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to report results: ${response.status} ${text}`);
  }

  console.log("Results reported successfully");
}
