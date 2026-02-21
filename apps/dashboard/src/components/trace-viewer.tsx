"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TraceEntry {
  role: string;
  text: string;
  timestamp_ms: number;
  latency_ms?: number;
  audio_ref?: string;
  audio_duration_ms?: number;
  stt_confidence?: number;
  time_to_first_byte_ms?: number;
}

interface TraceViewerProps {
  trace: TraceEntry[];
}

export function TraceViewer({ trace }: TraceViewerProps) {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowRaw(!showRaw)}
        >
          {showRaw ? "Chat View" : "Raw JSON"}
        </Button>
      </div>

      {showRaw ? (
        <Card>
          <CardContent className="py-4">
            <ScrollArea className="h-96">
              <pre className="text-xs font-mono whitespace-pre-wrap">
                {JSON.stringify(trace, null, 2)}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-96">
          <div className="space-y-3">
            {trace.map((entry, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  entry.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[80%] rounded-lg px-4 py-2",
                    entry.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  <p className="text-sm">{entry.text || "(empty)"}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <span className="text-xs opacity-60">
                      {entry.timestamp_ms}ms
                    </span>
                    {entry.latency_ms !== undefined && (
                      <span className="text-xs opacity-60">
                        latency: {entry.latency_ms}ms
                      </span>
                    )}
                    {entry.time_to_first_byte_ms !== undefined && (
                      <span className="text-xs opacity-60">
                        TTFB: {entry.time_to_first_byte_ms}ms
                      </span>
                    )}
                    {entry.stt_confidence !== undefined && (
                      <span className="text-xs opacity-60">
                        STT: {entry.stt_confidence}
                      </span>
                    )}
                    {entry.audio_duration_ms !== undefined && (
                      <span className="text-xs opacity-60">
                        audio: {(entry.audio_duration_ms / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
