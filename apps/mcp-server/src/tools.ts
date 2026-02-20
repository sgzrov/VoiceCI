import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const API_URL = process.env["API_URL"] ?? "http://localhost:3000";

export function registerTools(server: McpServer) {
  server.tool(
    "run_voice_ci",
    "Create and execute a VoiceCI test run",
    {
      bundle_key: z.string().describe("The S3 key of the uploaded bundle"),
      bundle_hash: z.string().describe("SHA-256 hash of the bundle"),
      mode: z
        .enum(["smoke", "ci", "deep"])
        .optional()
        .describe("Test mode"),
    },
    async ({ bundle_key, bundle_hash, mode }) => {
      const res = await fetch(`${API_URL}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: "bundle",
          bundle_key,
          bundle_hash,
          mode: mode ?? "smoke",
        }),
      });

      const run = await res.json();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(run, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "get_run_status",
    "Get the status of a VoiceCI run",
    {
      run_id: z.string().describe("The run ID to check"),
    },
    async ({ run_id }) => {
      const res = await fetch(`${API_URL}/runs/${run_id}`);
      const run = await res.json();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(run, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "get_run_result",
    "Get the full results of a completed VoiceCI run",
    {
      run_id: z.string().describe("The run ID to get results for"),
    },
    async ({ run_id }) => {
      const res = await fetch(`${API_URL}/runs/${run_id}`);
      const run = await res.json();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(run, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "list_test_suites",
    "List available VoiceCI test suites",
    {},
    async () => {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                suites: [
                  {
                    id: "basic",
                    name: "Basic Suite",
                    path: "demo/suites/basic.json",
                  },
                  {
                    id: "interruptions",
                    name: "Interruptions Suite",
                    path: "demo/suites/interruptions.json",
                  },
                ],
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
