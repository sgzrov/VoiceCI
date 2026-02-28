"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { RunDetailView } from "@/components/run-detail-view";
import { useRunEvents } from "@/hooks/use-run-events";
import type { RunDetail } from "@/lib/types";

const API_URL = "/backend";

export default function RunDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isActive = run?.status === "running" || run?.status === "queued";

  // SSE-driven events for active runs, static for completed
  const { events, isStreaming } = useRunEvents(
    id,
    run?.events ?? [],
    !!isActive,
  );

  useEffect(() => {
    let cancelled = false;
    const fetchRun = async () => {
      try {
        const res = await fetch(`${API_URL}/runs/${id}`, {
          credentials: "include",
        });
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError(`API ${res.status}`);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setRun(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    };

    fetchRun();

    // SSE handles live events — keep a slower poll as fallback for
    // run status, scenarios, and aggregate updates
    const pollInterval = isActive ? 5000 : 10000;
    const interval = setInterval(fetchRun, pollInterval);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, run?.status]);

  const handleSetBaseline = async () => {
    await fetch(`${API_URL}/runs/${id}/baseline`, {
      method: "POST",
      credentials: "include",
    });
    const res = await fetch(`${API_URL}/runs/${id}`, {
      credentials: "include",
    });
    setRun(await res.json());
  };

  if (error) return <p className="text-red-600 font-mono text-sm">{error}</p>;
  if (!run) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <RunDetailView
      run={run}
      events={events}
      isStreaming={isStreaming}
      onSetBaseline={handleSetBaseline}
    />
  );
}
