"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000";

interface Run {
  id: string;
  status: string;
  bundle_hash: string;
  created_at: string;
  duration_ms: number | null;
  aggregate_json: {
    total_scenarios: number;
    passed: number;
    failed: number;
  } | null;
}

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRuns = async () => {
      const params = new URLSearchParams();
      if (filter) params.set("status", filter);
      const res = await fetch(`${API_URL}/runs?${params}`);
      const data = await res.json();
      setRuns(data);
      setLoading(false);
    };

    fetchRuns();
    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, [filter]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Runs</h1>
        <div className="flex gap-2">
          {["", "queued", "running", "pass", "fail"].map((s) => (
            <Button
              key={s}
              variant={filter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(s)}
            >
              {s || "All"}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : runs.length === 0 ? (
        <p className="text-muted-foreground">No runs found.</p>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Link key={run.id} href={`/runs/${run.id}`}>
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-4">
                    <StatusBadge status={run.status} />
                    <div>
                      <p className="font-mono text-sm">{run.id.slice(0, 8)}...</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(run.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {run.aggregate_json && (
                      <span>
                        {run.aggregate_json.passed}/{run.aggregate_json.total_scenarios} passed
                      </span>
                    )}
                    {run.duration_ms !== null && (
                      <span>{(run.duration_ms / 1000).toFixed(1)}s</span>
                    )}
                    <span className="font-mono text-xs">
                      {run.bundle_hash.slice(0, 8)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
