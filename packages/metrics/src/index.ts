import type {
  TraceEntry,
  ScenarioMetrics,
  AggregateMetrics,
  Expectations,
  Failure,
} from "@voiceci/shared";

export { classifyFailures } from "./classifier.js";

export function computeScenarioMetrics(
  trace: TraceEntry[],
  expectations: Expectations
): { metrics: ScenarioMetrics; failures: Failure[]; passed: boolean } {
  const agentEntries = trace.filter((e) => e.role === "agent");
  const latencies = agentEntries
    .map((e) => e.latency_ms)
    .filter((l): l is number => l !== undefined);

  const sorted = [...latencies].sort((a, b) => a - b);
  const mean = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : 0;
  const p95Index = Math.min(
    Math.ceil(sorted.length * 0.95) - 1,
    sorted.length - 1
  );
  const p95 = sorted.length > 0 ? sorted[Math.max(0, p95Index)]! : 0;
  const max = sorted.length > 0 ? sorted[sorted.length - 1]! : 0;

  const timestamps = trace.map((e) => e.timestamp_ms);
  const duration =
    timestamps.length >= 2
      ? timestamps[timestamps.length - 1]! - timestamps[0]!
      : 0;

  const emptyResponses = agentEntries.filter(
    (e) => !e.text || e.text.trim() === ""
  ).length;

  const userMessages = trace.filter((e) => e.role === "user");
  const answeredCount = userMessages.filter((u) => {
    const uIdx = trace.indexOf(u);
    return trace.slice(uIdx + 1).some(
      (e) => e.role === "agent" && e.text.trim() !== ""
    );
  }).length;
  const flowCompletion =
    userMessages.length > 0 ? answeredCount / userMessages.length : 0;

  // Voice metrics
  const turnGaps = agentEntries
    .map((e) => e.time_to_first_byte_ms)
    .filter((t): t is number => t !== undefined);
  const meanTurnGap =
    turnGaps.length > 0
      ? Math.round(turnGaps.reduce((a, b) => a + b, 0) / turnGaps.length)
      : undefined;

  const sttConfidences = agentEntries
    .map((e) => e.stt_confidence)
    .filter((c): c is number => c !== undefined);
  const meanSttConfidence =
    sttConfidences.length > 0
      ? Math.round(
          (sttConfidences.reduce((a, b) => a + b, 0) / sttConfidences.length) *
            100
        ) / 100
      : undefined;

  const metrics: ScenarioMetrics = {
    mean_latency_ms: mean,
    p95_latency_ms: p95,
    max_latency_ms: max,
    duration_ms: Math.round(duration),
    empty_response_count: emptyResponses,
    flow_completion_score: Math.round(flowCompletion * 100) / 100,
    token_usage: null,
    cost_usd: null,
    mean_turn_gap_ms: meanTurnGap,
    mean_stt_confidence: meanSttConfidence,
  };

  const failures: Failure[] = [];

  if (
    expectations.max_latency_ms !== undefined &&
    max > expectations.max_latency_ms
  ) {
    failures.push({
      code: "LATENCY_EXCEEDED",
      message: `Max latency ${max}ms exceeded threshold ${expectations.max_latency_ms}ms`,
      actual: max,
      expected: expectations.max_latency_ms,
      scenario: "",
    });
  }

  if (
    expectations.flow_completion_min !== undefined &&
    flowCompletion < expectations.flow_completion_min
  ) {
    failures.push({
      code: "FLOW_INCOMPLETE",
      message: `Flow completion ${flowCompletion} below minimum ${expectations.flow_completion_min}`,
      actual: flowCompletion,
      expected: expectations.flow_completion_min,
      scenario: "",
    });
  }

  if (expectations.must_mention_keywords) {
    const agentText = agentEntries.map((e) => e.text.toLowerCase()).join(" ");
    for (const keyword of expectations.must_mention_keywords) {
      if (!agentText.includes(keyword.toLowerCase())) {
        failures.push({
          code: "MISSING_KEYWORD",
          message: `Agent did not mention required keyword: "${keyword}"`,
          actual: null,
          expected: keyword,
          scenario: "",
        });
      }
    }
  }

  if (
    expectations.max_turn_gap_ms !== undefined &&
    meanTurnGap !== undefined &&
    meanTurnGap > expectations.max_turn_gap_ms
  ) {
    failures.push({
      code: "TURN_GAP_EXCEEDED",
      message: `Mean turn gap ${meanTurnGap}ms exceeded threshold ${expectations.max_turn_gap_ms}ms`,
      actual: meanTurnGap,
      expected: expectations.max_turn_gap_ms,
      scenario: "",
    });
  }

  if (
    expectations.min_stt_confidence !== undefined &&
    meanSttConfidence !== undefined &&
    meanSttConfidence < expectations.min_stt_confidence
  ) {
    failures.push({
      code: "LOW_VOICE_CLARITY",
      message: `Mean STT confidence ${meanSttConfidence} below minimum ${expectations.min_stt_confidence}`,
      actual: meanSttConfidence,
      expected: expectations.min_stt_confidence,
      scenario: "",
    });
  }

  return {
    metrics,
    failures,
    passed: failures.length === 0,
  };
}

export function aggregateRunMetrics(
  scenarioMetrics: ScenarioMetrics[]
): AggregateMetrics {
  if (scenarioMetrics.length === 0) {
    return {
      total_scenarios: 0,
      passed: 0,
      failed: 0,
      mean_latency_ms: 0,
      p95_latency_ms: 0,
      max_latency_ms: 0,
      total_duration_ms: 0,
      total_token_usage: null,
      total_cost_usd: null,
    };
  }

  const allLatencies = scenarioMetrics.map((m) => m.mean_latency_ms);
  const mean = Math.round(
    allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length
  );
  const allP95 = scenarioMetrics.map((m) => m.p95_latency_ms);
  const sortedP95 = [...allP95].sort((a, b) => a - b);
  const p95Idx = Math.min(
    Math.ceil(sortedP95.length * 0.95) - 1,
    sortedP95.length - 1
  );
  const p95 = sortedP95[Math.max(0, p95Idx)]!;
  const maxLatency = Math.max(...scenarioMetrics.map((m) => m.max_latency_ms));
  const totalDuration = scenarioMetrics.reduce(
    (a, m) => a + m.duration_ms,
    0
  );

  const tokenUsages = scenarioMetrics
    .map((m) => m.token_usage)
    .filter((t): t is number => t !== null);
  const costs = scenarioMetrics
    .map((m) => m.cost_usd)
    .filter((c): c is number => c !== null);

  // Voice aggregate metrics
  const turnGaps = scenarioMetrics
    .map((m) => m.mean_turn_gap_ms)
    .filter((t): t is number => t !== undefined);
  const sttConfs = scenarioMetrics
    .map((m) => m.mean_stt_confidence)
    .filter((c): c is number => c !== undefined);

  return {
    total_scenarios: scenarioMetrics.length,
    passed: 0, // caller fills this in
    failed: 0, // caller fills this in
    mean_latency_ms: mean,
    p95_latency_ms: p95,
    max_latency_ms: maxLatency,
    total_duration_ms: totalDuration,
    total_token_usage: tokenUsages.length > 0
      ? tokenUsages.reduce((a, b) => a + b, 0)
      : null,
    total_cost_usd: costs.length > 0
      ? Math.round(costs.reduce((a, b) => a + b, 0) * 10000) / 10000
      : null,
    mean_turn_gap_ms: turnGaps.length > 0
      ? Math.round(turnGaps.reduce((a, b) => a + b, 0) / turnGaps.length)
      : undefined,
    mean_stt_confidence: sttConfs.length > 0
      ? Math.round(
          (sttConfs.reduce((a, b) => a + b, 0) / sttConfs.length) * 100
        ) / 100
      : undefined,
  };
}
