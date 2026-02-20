import type { Run, AggregateMetrics } from "@voiceci/shared";

export function printSummary(run: Run) {
  import("chalk").then(({ default: chalk }) => {
    const status = run.status === "pass" ? chalk.green("PASS") : chalk.red("FAIL");

    console.log(`\n  ${chalk.bold("Result:")} ${status}\n`);

    if (run.aggregate_json) {
      const agg = run.aggregate_json as AggregateMetrics;
      console.log(`  ${chalk.dim("Scenarios:")}  ${agg.passed} passed, ${agg.failed} failed, ${agg.total_scenarios} total`);
      console.log(`  ${chalk.dim("Latency:")}    mean=${agg.mean_latency_ms}ms  p95=${agg.p95_latency_ms}ms  max=${agg.max_latency_ms}ms`);
      console.log(`  ${chalk.dim("Duration:")}   ${agg.total_duration_ms}ms`);

      if (agg.total_token_usage !== null) {
        console.log(`  ${chalk.dim("Tokens:")}     ${agg.total_token_usage}`);
      }
      if (agg.total_cost_usd !== null) {
        console.log(`  ${chalk.dim("Cost:")}       $${agg.total_cost_usd}`);
      }
    }

    if (run.error_text) {
      console.log(`\n  ${chalk.red("Error:")} ${run.error_text}`);
    }

    console.log(`\n  ${chalk.dim("Run ID:")} ${run.id}`);
    console.log("");
  });
}
