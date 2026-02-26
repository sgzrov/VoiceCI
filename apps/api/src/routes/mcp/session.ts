import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// Session state — exported for callback.ts push notifications
export const transports = new Map<string, StreamableHTTPServerTransport>();
export const mcpServers = new Map<string, McpServer>();
export const runToSession = new Map<string, string>(); // run_id → session_id
export const runToProgress = new Map<string, string | number>(); // run_id → progressToken

export function cleanupSession(sessionId: string) {
  transports.delete(sessionId);
  const server = mcpServers.get(sessionId);
  if (server) {
    server.close().catch(() => {});
    mcpServers.delete(sessionId);
  }
  for (const [runId, sid] of runToSession.entries()) {
    if (sid === sessionId) runToSession.delete(runId);
  }
}

export interface StoredAdapterConfig {
  adapter: string;
  target_phone_number?: string;
  agent_url?: string;
  voice?: Record<string, unknown>;
  platform?: Record<string, unknown>;
}
