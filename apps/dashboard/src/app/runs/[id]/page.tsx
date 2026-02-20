"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { MetricCards } from "@/components/metric-cards";
import { ScenarioTable } from "@/components/scenario-table";
import { TraceViewer } from "@/components/trace-viewer";
import { BaselineDiff } from "@/components/baseline-diff";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000";

interface RunDetail {
  id: string;
  status: string;
  bundle_hash: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  aggregate_json: Record<string, unknown> | null;
  error_text: string | null;
  scenarios: ScenarioResult[];
  artifacts: Artifact[];
  is_baseline: boolean;
}

interface ScenarioResult {
  id: string;
  name: string;
  status: string;
  metrics_json: Record<string, unknown>;
  trace_json: TraceEntry[];
}

interface TraceEntry {
  role: string;
  text: string;
  timestamp_ms: number;
  latency_ms?: number;
}

interface Artifact {
  id: string;
  kind: string;
  key: string;
  content_type: string;
  byte_size: number;
}

export default function RunDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [run, setRun] = useState<RunDetail | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);

  useEffect(() => {
    const fetchRun = async () => {
      const res = await fetch(`${API_URL}/runs/${id}`);
      const data = await res.json();
      setRun(data);
    };

    fetchRun();
    const interval = setInterval(fetchRun, 5000);
    return () => clearInterval(interval);
  }, [id]);

  const handleSetBaseline = async () => {
    await fetch(`${API_URL}/runs/${id}/baseline`, { method: "POST" });
    const res = await fetch(`${API_URL}/runs/${id}`);
    setRun(await res.json());
  };

  if (!run) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  const selectedTrace = selectedScenario
    ? run.scenarios.find((s) => s.id === selectedScenario)?.trace_json
    : null;

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <StatusBadge status={run.status} size="lg" />
          <div>
            <h1 className="text-xl font-bold font-mono">{run.id.slice(0, 12)}...</h1>
            <p className="text-sm text-muted-foreground">
              Created {new Date(run.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {run.is_baseline ? (
            <Button variant="outline" size="sm" disabled>
              Baseline
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleSetBaseline}>
              Set as Baseline
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {run.error_text && (
        <Card className="border-destructive">
          <CardContent className="py-4">
            <p className="text-sm text-destructive">{run.error_text}</p>
          </CardContent>
        </Card>
      )}

      {/* Aggregate Metrics */}
      {run.aggregate_json && <MetricCards metrics={run.aggregate_json} />}

      {/* Tabs */}
      <Tabs defaultValue="scenarios">
        <TabsList>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          <TabsTrigger value="trace">Trace</TabsTrigger>
          <TabsTrigger value="artifacts">Artifacts</TabsTrigger>
          <TabsTrigger value="baseline">Baseline</TabsTrigger>
        </TabsList>

        <TabsContent value="scenarios" className="mt-4">
          <ScenarioTable
            scenarios={run.scenarios}
            onSelect={(id) => setSelectedScenario(id)}
          />
        </TabsContent>

        <TabsContent value="trace" className="mt-4">
          {selectedTrace ? (
            <TraceViewer trace={selectedTrace} />
          ) : (
            <p className="text-muted-foreground text-sm">
              Select a scenario to view its trace.
            </p>
          )}
        </TabsContent>

        <TabsContent value="artifacts" className="mt-4">
          {run.artifacts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No artifacts.</p>
          ) : (
            <div className="space-y-2">
              {run.artifacts.map((a) => (
                <Card key={a.id}>
                  <CardContent className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-mono">{a.key}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.kind} &middot; {a.content_type} &middot;{" "}
                        {(a.byte_size / 1024).toFixed(1)}KB
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="baseline" className="mt-4">
          <BaselineDiff runId={run.id} currentMetrics={run.aggregate_json} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
