import type { FastifyReply } from "fastify";

/**
 * In-memory SSE subscriber manager for live run event streaming.
 * Maps run IDs to connected SSE clients.
 */

const subscribers = new Map<string, Set<FastifyReply>>();

export function subscribe(runId: string, reply: FastifyReply): void {
  let set = subscribers.get(runId);
  if (!set) {
    set = new Set();
    subscribers.set(runId, set);
  }
  set.add(reply);
}

export function unsubscribe(runId: string, reply: FastifyReply): void {
  const set = subscribers.get(runId);
  if (!set) return;
  set.delete(reply);
  if (set.size === 0) {
    subscribers.delete(runId);
  }
}

export interface RunEventPayload {
  id?: string;
  run_id: string;
  event_type: string;
  message: string;
  metadata_json?: Record<string, unknown> | null;
  created_at?: string;
}

export function broadcast(runId: string, event: RunEventPayload): void {
  const set = subscribers.get(runId);
  if (!set || set.size === 0) return;

  const data = JSON.stringify(event);

  for (const reply of set) {
    try {
      reply.raw.write(`data: ${data}\n\n`);
    } catch {
      // Client disconnected — clean up on next unsubscribe
    }
  }
}
