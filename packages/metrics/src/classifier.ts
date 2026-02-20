import type { Failure, TraceEntry, Expectations } from "@voiceci/shared";

export function classifyFailures(
  scenarioName: string,
  trace: TraceEntry[],
  expectations: Expectations
): Failure[] {
  const failures: Failure[] = [];
  const agentEntries = trace.filter((e) => e.role === "agent");

  if (agentEntries.length === 0) {
    failures.push({
      code: "NO_RESPONSE",
      message: "Agent produced no responses",
      actual: null,
      expected: "at least one response",
      scenario: scenarioName,
    });
    return failures;
  }

  const allEmpty = agentEntries.every((e) => !e.text || e.text.trim() === "");
  if (allEmpty) {
    failures.push({
      code: "EMPTY_RESPONSES",
      message: "All agent responses were empty",
      actual: null,
      expected: "non-empty responses",
      scenario: scenarioName,
    });
  }

  const latencies = agentEntries
    .map((e) => e.latency_ms)
    .filter((l): l is number => l !== undefined);

  if (
    expectations.max_latency_ms !== undefined &&
    latencies.some((l) => l > expectations.max_latency_ms!)
  ) {
    const max = Math.max(...latencies);
    failures.push({
      code: "LATENCY_EXCEEDED",
      message: `Latency ${max}ms exceeded max ${expectations.max_latency_ms}ms`,
      actual: max,
      expected: expectations.max_latency_ms,
      scenario: scenarioName,
    });
  }

  if (expectations.must_mention_keywords) {
    const agentText = agentEntries.map((e) => e.text.toLowerCase()).join(" ");
    for (const kw of expectations.must_mention_keywords) {
      if (!agentText.includes(kw.toLowerCase())) {
        failures.push({
          code: "MISSING_KEYWORD",
          message: `Keyword "${kw}" not found in agent responses`,
          actual: null,
          expected: kw,
          scenario: scenarioName,
        });
      }
    }
  }

  if (expectations.flow_completion_min !== undefined) {
    const userMessages = trace.filter((e) => e.role === "user");
    const answered = userMessages.filter((u) => {
      const idx = trace.indexOf(u);
      return trace.slice(idx + 1).some(
        (e) => e.role === "agent" && e.text.trim() !== ""
      );
    }).length;
    const score = userMessages.length > 0 ? answered / userMessages.length : 0;
    if (score < expectations.flow_completion_min) {
      failures.push({
        code: "FLOW_INCOMPLETE",
        message: `Flow completion ${score.toFixed(2)} below min ${expectations.flow_completion_min}`,
        actual: score,
        expected: expectations.flow_completion_min,
        scenario: scenarioName,
      });
    }
  }

  return failures;
}
