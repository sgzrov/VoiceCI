import type {
  Suite,
  ScenarioResultPayload,
  AggregateMetrics,
  TraceEntry,
} from "@voiceci/shared";
import type { AgentAdapter } from "@voiceci/adapters";
import { computeScenarioMetrics, aggregateRunMetrics } from "@voiceci/metrics";
import { createStorageClient, type S3Storage } from "@voiceci/artifacts";

export interface ExecutionResults {
  scenario_results: ScenarioResultPayload[];
  aggregate: AggregateMetrics;
  status: "pass" | "fail";
}

function tryCreateStorage(): S3Storage | null {
  if (!process.env["S3_ENDPOINT"]) return null;
  try {
    return createStorageClient();
  } catch {
    return null;
  }
}

export async function executeScenarios(
  suite: Suite,
  adapter: AgentAdapter,
  runId?: string
): Promise<ExecutionResults> {
  const storage = tryCreateStorage();
  const scenarioResults: ScenarioResultPayload[] = [];
  let passed = 0;
  let failed = 0;

  for (const scenario of suite.scenarios) {
    console.log(`  Running scenario: ${scenario.name}`);

    const trace: TraceEntry[] = [];
    const startTime = performance.now();
    let turnIndex = 0;

    for (const userMessage of scenario.user_script) {
      const userTimestamp = performance.now() - startTime;
      trace.push({
        role: "user",
        text: userMessage,
        timestamp_ms: Math.round(userTimestamp),
      });

      try {
        const response = await adapter.sendMessage(userMessage);
        const agentTimestamp = performance.now() - startTime;

        let audioRef: string | undefined;
        if (response.audio && response.audio.length > 0 && storage && runId) {
          audioRef = `audio/${runId}/${scenario.name}/${turnIndex}.pcm`;
          await storage.upload(audioRef, response.audio, "audio/L16;rate=24000").catch((err) => {
            console.warn(`    Failed to upload audio: ${err instanceof Error ? err.message : err}`);
            audioRef = undefined;
          });
        }

        trace.push({
          role: "agent",
          text: response.text,
          timestamp_ms: Math.round(agentTimestamp),
          latency_ms: response.latency_ms,
          audio_ref: audioRef,
          audio_duration_ms: response.audio_duration_ms,
          stt_confidence: response.stt_confidence,
          time_to_first_byte_ms: response.time_to_first_byte_ms,
        });
      } catch (err) {
        const agentTimestamp = performance.now() - startTime;
        trace.push({
          role: "agent",
          text: "",
          timestamp_ms: Math.round(agentTimestamp),
          latency_ms: Math.round(performance.now() - startTime - userTimestamp),
        });
        console.warn(
          `    Error in scenario ${scenario.name}:`,
          err instanceof Error ? err.message : err
        );
      }

      turnIndex++;
    }

    const { metrics, failures, passed: scenarioPassed } = computeScenarioMetrics(
      trace,
      scenario.expectations
    );

    const status = scenarioPassed ? "pass" : "fail";
    if (scenarioPassed) passed++;
    else failed++;

    console.log(`    ${scenario.name}: ${status} (${metrics.duration_ms}ms)`);

    if (failures.length > 0) {
      for (const f of failures) {
        console.log(`      FAIL: ${f.message}`);
      }
    }

    scenarioResults.push({
      name: scenario.name,
      status,
      metrics,
      trace,
    });
  }

  const allMetrics = scenarioResults.map((r) => r.metrics);
  const aggregate = aggregateRunMetrics(allMetrics);
  aggregate.passed = passed;
  aggregate.failed = failed;

  const overallStatus = failed === 0 ? "pass" : "fail";

  return {
    scenario_results: scenarioResults,
    aggregate,
    status: overallStatus,
  };
}
