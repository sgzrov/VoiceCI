import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { schema } from "@voiceci/db";
import { createStorageClient } from "@voiceci/artifacts";
import { z } from "zod";
import { AudioTestNameSchema, ConversationTestSpecSchema, AdapterTypeSchema } from "@voiceci/shared";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export async function mcpRoutes(app: FastifyInstance) {
  const mcpServer = new McpServer({
    name: "voiceci",
    version: "0.2.0",
  });

  // --- Tool: prepare_upload ---
  mcpServer.tool(
    "prepare_upload",
    "Get a presigned URL to upload your voice agent bundle for testing",
    {},
    async () => {
      const storage = createStorageClient();
      const bundleKey = `bundles/${randomUUID()}.tar.gz`;
      const uploadUrl = await storage.presignUpload(bundleKey);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                upload_url: uploadUrl,
                bundle_key: bundleKey,
                instructions: [
                  "1. Bundle your project: tar czf /tmp/voiceci-bundle.tar.gz --exclude=node_modules --exclude=.git --exclude=dist --exclude=.next --exclude=.turbo --exclude=coverage -C <project_root> .",
                  "2. Compute the hash: shasum -a 256 /tmp/voiceci-bundle.tar.gz | awk '{print $1}'",
                  '3. Upload: curl -X PUT -T /tmp/voiceci-bundle.tar.gz -H "Content-Type: application/gzip" "<upload_url>"',
                  "4. Call run_tests with the bundle_key and bundle_hash",
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

  // --- Tool: run_tests ---
  mcpServer.tool(
    "run_tests",
    "Start a VoiceCI test run against an uploaded voice agent bundle. Specify audio_tests for infrastructure checks and/or conversation_tests for behavioral checks.",
    {
      bundle_key: z.string().describe("The bundle key returned by prepare_upload"),
      bundle_hash: z.string().describe("SHA-256 hash of the uploaded bundle"),
      adapter: AdapterTypeSchema.describe(
        "Transport adapter: ws-voice (WebSocket), sip (phone call via Plivo), or webrtc (LiveKit)"
      ),
      audio_tests: z
        .array(AudioTestNameSchema)
        .optional()
        .describe(
          "Prebuilt audio tests to run: echo, barge_in, ttfb, silence_handling, connection_stability, response_completeness"
        ),
      conversation_tests: z
        .array(ConversationTestSpecSchema)
        .optional()
        .describe(
          "Dynamic conversation tests. Each has a caller_prompt (persona/goal), max_turns, and eval (questions to judge the agent on)"
        ),
      target_phone_number: z
        .string()
        .optional()
        .describe("Phone number for SIP adapter (required when adapter is sip)"),
      voice: z
        .object({
          tts: z.object({ voice_id: z.string().optional() }).optional(),
          stt: z.object({ api_key_env: z.string().optional() }).optional(),
          silence_threshold_ms: z.number().optional(),
          webrtc: z.object({ room: z.string().optional() }).optional(),
        })
        .optional()
        .describe("Voice configuration overrides"),
    },
    async ({ bundle_key, bundle_hash, adapter, audio_tests, conversation_tests, target_phone_number, voice }) => {
      // Validate at least one test type is specified
      if (
        (!audio_tests || audio_tests.length === 0) &&
        (!conversation_tests || conversation_tests.length === 0)
      ) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Error: At least one audio_test or conversation_test is required",
            },
          ],
          isError: true,
        };
      }

      const testSpec = { audio_tests, conversation_tests };

      const [run] = await app.db
        .insert(schema.runs)
        .values({
          source_type: "bundle",
          bundle_key,
          bundle_hash,
          status: "queued",
          test_spec_json: testSpec,
        })
        .returning();

      await app.runQueue.add("execute-run", {
        run_id: run!.id,
        bundle_key,
        bundle_hash,
        adapter,
        test_spec: testSpec,
        target_phone_number,
        voice_config: voice ? { adapter, target_phone_number, voice } : { adapter, target_phone_number },
      });

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ run_id: run!.id, status: "queued" }, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool: get_run_status ---
  mcpServer.tool(
    "get_run_status",
    "Check the current status of a VoiceCI test run",
    {
      run_id: z.string().describe("The run ID to check"),
    },
    async ({ run_id }) => {
      const [run] = await app.db
        .select()
        .from(schema.runs)
        .where(eq(schema.runs.id, run_id))
        .limit(1);

      if (!run) {
        return {
          content: [{ type: "text" as const, text: "Run not found" }],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ run_id: run.id, status: run.status }, null, 2),
          },
        ],
      };
    }
  );

  // --- Tool: get_run_result ---
  mcpServer.tool(
    "get_run_result",
    "Get the full results of a completed VoiceCI test run including audio test metrics and conversation eval results",
    {
      run_id: z.string().describe("The run ID to get results for"),
    },
    async ({ run_id }) => {
      const [run] = await app.db
        .select()
        .from(schema.runs)
        .where(eq(schema.runs.id, run_id))
        .limit(1);

      if (!run) {
        return {
          content: [{ type: "text" as const, text: "Run not found" }],
          isError: true,
        };
      }

      const testResults = await app.db
        .select()
        .from(schema.scenarioResults)
        .where(eq(schema.scenarioResults.run_id, run_id));

      // Separate audio and conversation results by test_type
      const audioResults = testResults
        .filter((r) => r.test_type === "audio")
        .map((r) => r.metrics_json);
      const conversationResults = testResults
        .filter((r) => r.test_type === "conversation")
        .map((r) => r.metrics_json);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                run_id: run.id,
                status: run.status,
                aggregate: run.aggregate_json,
                audio_results: audioResults,
                conversation_results: conversationResults,
                error_text: run.error_text,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Stateless transport — no session tracking needed
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await mcpServer.connect(transport);

  const authPreHandler = { preHandler: app.verifyApiKey };

  // POST /mcp — handles MCP JSON-RPC requests
  app.post("/mcp", authPreHandler, async (request, reply) => {
    reply.hijack();
    await transport.handleRequest(request.raw, reply.raw, request.body);
  });

  // GET /mcp — not needed for stateless, return 405
  app.get("/mcp", authPreHandler, async (_request, reply) => {
    reply.status(405).send({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });

  // DELETE /mcp — not needed for stateless, return 405
  app.delete("/mcp", authPreHandler, async (_request, reply) => {
    reply.status(405).send({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    });
  });
}
