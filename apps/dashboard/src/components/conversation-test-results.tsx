"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { TraceViewer } from "@/components/trace-viewer";
import { EvalResults } from "@/components/eval-results";
import { ConversationMetricsPanel } from "@/components/conversation-metrics-panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ScenarioResultRow,
  ConversationTestResult,
  ObservedToolCall,
} from "@/lib/types";
import { formatDuration } from "@/lib/format";

interface ConversationTestResultsProps {
  scenarios: ScenarioResultRow[];
}

function ToolCallsList({ calls }: { calls: ObservedToolCall[] }) {
  return (
    <div className="space-y-2">
      {calls.map((call, i) => (
        <Card key={i}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${call.successful === false ? "bg-red-500" : "bg-emerald-500"}`}
                />
                <span className="text-sm font-mono">{call.name}</span>
              </div>
              {call.latency_ms != null && (
                <span className="text-xs text-muted-foreground">
                  {Math.round(call.latency_ms)}ms
                </span>
              )}
            </div>
            <pre className="text-xs font-mono text-muted-foreground mt-1 overflow-x-auto">
              {JSON.stringify(call.arguments, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ConversationTestResults({
  scenarios,
}: ConversationTestResultsProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
        Conversation Tests
      </h3>
      <div className="space-y-2">
        {scenarios.map((scenario) => {
          const result = scenario.metrics_json as ConversationTestResult;
          const isExpanded = expandedId === scenario.id;
          const evalsPassed = result.eval_results.filter(
            (e) => e.passed
          ).length;
          const evalsTotal = result.eval_results.filter(
            (e) => e.relevant
          ).length;

          return (
            <Card
              key={scenario.id}
              className={isExpanded ? "ring-1 ring-border" : ""}
            >
              <CardContent className="py-0">
                <div
                  className="flex items-center justify-between py-3 cursor-pointer"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : scenario.id)
                  }
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge status={result.status} />
                    <p className="text-sm font-medium">
                      {result.name ?? scenario.name}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      Evals {evalsPassed}/{evalsTotal}
                    </span>
                    <span>
                      TTFB {Math.round(result.metrics.mean_ttfb_ms)}ms
                    </span>
                    <span>{result.metrics.turns} turns</span>
                    <span>{formatDuration(result.duration_ms)}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="pb-4 border-t border-border pt-4">
                    <Tabs defaultValue="transcript">
                      <TabsList>
                        <TabsTrigger value="transcript">Transcript</TabsTrigger>
                        <TabsTrigger value="evals">
                          Evals ({evalsPassed}/{evalsTotal})
                        </TabsTrigger>
                        <TabsTrigger value="metrics">Metrics</TabsTrigger>
                        {result.observed_tool_calls &&
                          result.observed_tool_calls.length > 0 && (
                            <TabsTrigger value="tools">
                              Tools ({result.observed_tool_calls.length})
                            </TabsTrigger>
                          )}
                      </TabsList>
                      <TabsContent value="transcript" className="mt-3">
                        <TraceViewer trace={result.transcript} evalResults={result.eval_results} />
                      </TabsContent>
                      <TabsContent value="evals" className="mt-3">
                        <EvalResults
                          evalResults={result.eval_results}
                          toolCallEvalResults={result.tool_call_eval_results}
                        />
                      </TabsContent>
                      <TabsContent value="metrics" className="mt-3">
                        <ConversationMetricsPanel metrics={result.metrics} />
                      </TabsContent>
                      {result.observed_tool_calls && (
                        <TabsContent value="tools" className="mt-3">
                          <ToolCallsList calls={result.observed_tool_calls} />
                        </TabsContent>
                      )}
                    </Tabs>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
