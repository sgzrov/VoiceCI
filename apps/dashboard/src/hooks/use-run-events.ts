"use client";

import { useEffect, useRef, useState } from "react";
import type { RunEventRow } from "@/lib/types";

const API_URL = "/backend";

/**
 * Streams run events via SSE for active runs, returns static events for completed runs.
 */
export function useRunEvents(
  runId: string,
  initialEvents: RunEventRow[],
  isActive: boolean,
): { events: RunEventRow[]; isStreaming: boolean } {
  const [events, setEvents] = useState<RunEventRow[]>(initialEvents);
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const seenIds = useRef(new Set<string>());

  // Sync initial events when they change (e.g. from a poll refresh)
  useEffect(() => {
    if (!isActive) {
      setEvents(initialEvents);
    }
  }, [initialEvents, isActive]);

  useEffect(() => {
    if (!isActive) {
      // Clean up any existing connection
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setIsStreaming(false);
      return;
    }

    // Track seen IDs to deduplicate
    seenIds.current = new Set(initialEvents.map((e) => e.id));
    setEvents(initialEvents);

    const es = new EventSource(`${API_URL}/runs/${runId}/stream`, {
      withCredentials: true,
    });
    eventSourceRef.current = es;
    setIsStreaming(true);

    es.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as RunEventRow;

        // Deduplicate (initial batch may overlap with already-fetched events)
        if (event.id && seenIds.current.has(event.id)) return;
        if (event.id) seenIds.current.add(event.id);

        setEvents((prev) => [...prev, event]);

        // Close on run_complete
        if (event.event_type === "run_complete") {
          es.close();
          setIsStreaming(false);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects, but mark as not streaming temporarily
      setIsStreaming(false);
    };

    es.onopen = () => {
      setIsStreaming(true);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setIsStreaming(false);
    };
  }, [runId, isActive]);

  return { events, isStreaming };
}
