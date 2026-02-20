"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000";

interface BaselineDiffProps {
  runId: string;
  currentMetrics: Record<string, unknown> | null;
}

interface DeltaCard {
  label: string;
  current: number;
  baseline: number;
  unit: string;
  lowerIsBetter: boolean;
}

export function BaselineDiff({ runId, currentMetrics }: BaselineDiffProps) {
  const [baselineMetrics, setBaselineMetrics] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBaseline = async () => {
      try {
        const res = await fetch(`${API_URL}/runs?limit=200`);
        const runs = (await res.json()) as Array<{
          id: string;
          aggregate_json: Record<string, unknown> | null;
        }>;

        for (const run of runs) {
          if (run.id === runId) continue;
          const detailRes = await fetch(`${API_URL}/runs/${run.id}`);
          const detail = await detailRes.json();
          if (detail.is_baseline && detail.aggregate_json) {
            setBaselineMetrics(detail.aggregate_json);
            break;
          }
        }
      } catch {
        // No baseline found
      }
      setLoading(false);
    };

    fetchBaseline();
  }, [runId]);

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading baseline...</p>;
  }

  if (!baselineMetrics || !currentMetrics) {
    return (
      <p className="text-muted-foreground text-sm">
        No baseline set. Mark a passing run as baseline to see comparisons.
      </p>
    );
  }

  const deltas: DeltaCard[] = [
    {
      label: "Mean Latency",
      current: Number(currentMetrics["mean_latency_ms"] ?? 0),
      baseline: Number(baselineMetrics["mean_latency_ms"] ?? 0),
      unit: "ms",
      lowerIsBetter: true,
    },
    {
      label: "P95 Latency",
      current: Number(currentMetrics["p95_latency_ms"] ?? 0),
      baseline: Number(baselineMetrics["p95_latency_ms"] ?? 0),
      unit: "ms",
      lowerIsBetter: true,
    },
    {
      label: "Max Latency",
      current: Number(currentMetrics["max_latency_ms"] ?? 0),
      baseline: Number(baselineMetrics["max_latency_ms"] ?? 0),
      unit: "ms",
      lowerIsBetter: true,
    },
    {
      label: "Pass Rate",
      current:
        Number(currentMetrics["total_scenarios"] ?? 0) > 0
          ? Number(currentMetrics["passed"] ?? 0) /
            Number(currentMetrics["total_scenarios"])
          : 0,
      baseline:
        Number(baselineMetrics["total_scenarios"] ?? 0) > 0
          ? Number(baselineMetrics["passed"] ?? 0) /
            Number(baselineMetrics["total_scenarios"])
          : 0,
      unit: "%",
      lowerIsBetter: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {deltas.map((d) => {
        const diff = d.current - d.baseline;
        const isImproved = d.lowerIsBetter ? diff < 0 : diff > 0;
        const isWorse = d.lowerIsBetter ? diff > 0 : diff < 0;
        const displayDiff =
          d.unit === "%"
            ? `${diff > 0 ? "+" : ""}${(diff * 100).toFixed(1)}%`
            : `${diff > 0 ? "+" : ""}${Math.round(diff)}${d.unit}`;

        return (
          <Card key={d.label}>
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground">{d.label}</p>
              <p className="text-lg font-bold mt-1">
                {d.unit === "%"
                  ? `${(d.current * 100).toFixed(0)}%`
                  : `${Math.round(d.current)}${d.unit}`}
              </p>
              <p
                className={cn(
                  "text-xs mt-0.5 font-medium",
                  isImproved && "text-green-400",
                  isWorse && "text-red-400",
                  !isImproved && !isWorse && "text-muted-foreground"
                )}
              >
                {displayDiff} vs baseline
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
