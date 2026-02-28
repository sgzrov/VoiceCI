"use client";

import { cn } from "@/lib/utils";
import type { RunEventRow } from "@/lib/types";

interface RunTimelineProps {
  events: RunEventRow[];
  isStreaming: boolean;
}

function dotColor(event: RunEventRow): string {
  const meta = event.metadata_json;

  if (event.event_type === "error") return "bg-red-500";
  if (event.event_type === "run_complete") {
    return meta?.status === "fail" ? "bg-red-500" : "bg-emerald-500";
  }
  if (event.event_type === "test_completed") {
    return meta?.status === "fail" ? "bg-red-500" : "bg-emerald-500";
  }
  if (event.event_type === "health_check_passed") return "bg-emerald-500";
  return "bg-blue-500";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function RunTimeline({ events, isStreaming }: RunTimelineProps) {
  if (events.length === 0 && !isStreaming) return null;

  return (
    <div className="space-y-0">
      {events.map((event, i) => {
        const isLast = i === events.length - 1 && !isStreaming;

        return (
          <div key={event.id ?? i} className="flex gap-3 relative">
            {/* Vertical line + dot */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "h-2.5 w-2.5 rounded-full mt-1.5 shrink-0",
                  dotColor(event),
                )}
              />
              {!isLast && <div className="w-px flex-1 bg-border" />}
            </div>
            {/* Content */}
            <div className="pb-3 min-w-0">
              <p className="text-sm font-mono">{event.message}</p>
              <p className="text-xs text-muted-foreground">
                {formatTime(event.created_at)}
              </p>
            </div>
          </div>
        );
      })}
      {/* Pulsing indicator when streaming */}
      {isStreaming && (
        <div className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse mt-1.5" />
          </div>
          <p className="text-sm text-muted-foreground">
            Waiting for next event...
          </p>
        </div>
      )}
    </div>
  );
}
