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

  // Voice-specific failure checks
  if (expectations.max_turn_gap_ms !== undefined) {
    const turnGaps = agentEntries
      .map((e) => e.time_to_first_byte_ms)
      .filter((t): t is number => t !== undefined);
    if (turnGaps.length > 0) {
      const meanGap = Math.round(
        turnGaps.reduce((a, b) => a + b, 0) / turnGaps.length
      );
      if (meanGap > expectations.max_turn_gap_ms) {
        failures.push({
          code: "TURN_GAP_EXCEEDED",
          message: `Mean turn gap ${meanGap}ms exceeded max ${expectations.max_turn_gap_ms}ms`,
          actual: meanGap,
          expected: expectations.max_turn_gap_ms,
          scenario: scenarioName,
        });
      }
    }
  }

  if (expectations.min_stt_confidence !== undefined) {
    const confidences = agentEntries
      .map((e) => e.stt_confidence)
      .filter((c): c is number => c !== undefined);
    if (confidences.length > 0) {
      const meanConf =
        Math.round(
          (confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100
        ) / 100;
      if (meanConf < expectations.min_stt_confidence) {
        failures.push({
          code: "LOW_VOICE_CLARITY",
          message: `Mean STT confidence ${meanConf} below min ${expectations.min_stt_confidence}`,
          actual: meanConf,
          expected: expectations.min_stt_confidence,
          scenario: scenarioName,
        });
      }
    }
  }

  return failures;
}
