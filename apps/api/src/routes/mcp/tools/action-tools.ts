import type { FastifyInstance } from "fastify";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { schema } from "@voiceci/db";
import { createStorageClient } from "@voiceci/artifacts";
import { z } from "zod";
import {
  AudioTestNameSchema,
  ConversationTestSpecSchema,
  AdapterTypeSchema,
  AudioTestThresholdsSchema,
  LoadPatternSchema,
  PlatformConfigSchema,
} from "@voiceci/shared";
import { runLoadTestInProcess } from "../../../services/test-runner.js";
import { runToSession, runToProgress, type StoredAdapterConfig } from "../session.js";

export function registerActionTools(
  server: McpServer,
  app: FastifyInstance,
  apiKeyId: string,
  userId: string,
  adapterConfigs: Map<string, StoredAdapterConfig>,
) {
  // --- Tool: voiceci_configure_adapter ---
  server.registerTool("voiceci_configure_adapter", {
    title: "Configure Adapter",
    description: "Configure voice/platform/telephony settings for an adapter and get back a reusable adapter_config_id. Pass this ID to voiceci_run_suite or voiceci_load_test instead of repeating the full voice/platform config each time. Config is stored per-session.",
    inputSchema: {
      adapter: AdapterTypeSchema.describe(
        "Transport: ws-voice (WebSocket), sip (phone via Plivo), webrtc (LiveKit), vapi (Vapi platform), retell (Retell platform via SIP + API), elevenlabs (ElevenLabs platform), bland (Bland platform via SIP + API)"
      ),
      target_phone_number: z
        .string()
        .optional()
        .describe("Phone number to call. Required for sip, retell, and bland adapters."),
      agent_url: z
        .string()
        .optional()
        .describe("Agent base URL. Required for ws-voice with already-deployed agent, or for load tests."),
      platform: PlatformConfigSchema.optional().describe(
        "Platform config for vapi/retell/elevenlabs/bland adapters. Required for platform adapters."
      ),
      voice: z
        .object({
          tts: z.object({ voice_id: z.string().optional() }).optional(),
          stt: z.object({ api_key_env: z.string().optional() }).optional(),
          silence_threshold_ms: z.number().optional(),
          webrtc: z.object({
            livekit_url_env: z.string().optional(),
            api_key_env: z.string().optional(),
            api_secret_env: z.string().optional(),
            room: z.string().optional(),
          }).optional(),
          telephony: z.object({
            auth_id_env: z.string().optional(),
            auth_token_env: z.string().optional(),
            from_number: z.string().optional(),
          }).optional(),
        })
        .optional()
        .describe("Voice configuration overrides (TTS, STT, telephony, WebRTC)."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, async ({ adapter, target_phone_number, agent_url, platform, voice }) => {
    const configId = randomUUID();
    adapterConfigs.set(configId, {
      adapter,
      target_phone_number,
      agent_url,
      voice: voice as Record<string, unknown> | undefined,
      platform: platform as Record<string, unknown> | undefined,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            adapter_config_id: configId,
            adapter,
            message: "Adapter configured. Pass adapter_config_id to voiceci_run_suite or voiceci_load_test.",
          }, null, 2),
        },
      ],
    };
  });

  // --- Tool: voiceci_prepare_upload ---
  server.registerTool("voiceci_prepare_upload", {
    title: "Prepare Agent Upload",
    description: "Get a presigned URL and bash command to bundle and upload a voice agent for testing. Only needed for ws-voice adapter — sip/webrtc agents don't need uploads. Run the returned command, then pass bundle_key, bundle_hash, and lockfile_hash to voiceci_run_suite.",
    inputSchema: {
      project_root: z
        .string()
        .optional()
        .describe("Absolute path to agent project root. Used to generate the upload command."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, async ({ project_root }) => {
    const storage = createStorageClient();
    const bundleKey = `bundles/${randomUUID()}.tar.gz`;
    const uploadUrl = await storage.presignUpload(bundleKey);

    const excludes = "--exclude=node_modules --exclude=.git --exclude=dist --exclude=.next --exclude=.turbo --exclude=coverage";
    const root = project_root ?? ".";
    const tarTarget = project_root
      ? `-C ${project_root} .`
      : ".";

    // Compute lockfile hash from whichever lockfile exists
    const lockfileHashCmd = `(cat "${root}/package-lock.json" "${root}/yarn.lock" "${root}/pnpm-lock.yaml" 2>/dev/null || true) | shasum -a 256 | awk '{print $1}'`;

    const uploadCommand = [
      `tar czf /tmp/vci-bundle.tar.gz ${excludes} ${tarTarget}`,
      `BUNDLE_HASH=$(shasum -a 256 /tmp/vci-bundle.tar.gz | awk '{print $1}')`,
      `LOCKFILE_HASH=$(${lockfileHashCmd})`,
      `curl -sf -X PUT -T /tmp/vci-bundle.tar.gz -H 'Content-Type: application/gzip' '${uploadUrl}'`,
      `echo "BUNDLE_HASH=$BUNDLE_HASH"`,
      `echo "LOCKFILE_HASH=$LOCKFILE_HASH"`,
    ].join(" && ");

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              bundle_key: bundleKey,
              upload_command: uploadCommand,
              instructions: "Run the command. Parse BUNDLE_HASH and LOCKFILE_HASH from the output. Pass all three (bundle_key, bundle_hash, lockfile_hash) to voiceci_run_suite.",
            },
            null,
            2
          ),
        },
      ],
    };
  });

  // --- Tool: voiceci_run_suite ---
  server.registerTool("voiceci_run_suite", {
    title: "Run Test Suite",
    description: "Run a test suite against a voice agent. All tests run in parallel with independent connections. For already-deployed agents (SIP/WebRTC, or ws-voice with agent_url), tests run directly in a worker process. For bundled ws-voice agents, a Fly Machine is provisioned. Results are pushed via SSE as each test completes. bundle_key is reusable across runs. Use audio_test_thresholds to override default pass/fail criteria. Call voiceci_get_scenario_guide before designing tests.",
    inputSchema: {
      idempotency_key: z
        .string()
        .uuid()
        .optional()
        .describe("Optional UUID to prevent duplicate runs on retries. If a run with this key exists, its run_id is returned instead of creating a new run."),
      adapter_config_id: z
        .string()
        .uuid()
        .optional()
        .describe("Reusable adapter config ID from voiceci_configure_adapter. When provided, adapter/voice/platform/target_phone_number/agent_url are resolved from the stored config."),
      bundle_key: z
        .string()
        .optional()
        .describe("Bundle key from voiceci_prepare_upload. Required for ws-voice, omit for sip/webrtc."),
      bundle_hash: z
        .string()
        .optional()
        .describe("SHA-256 hash of uploaded bundle. Required for ws-voice, omit for sip/webrtc."),
      lockfile_hash: z
        .string()
        .optional()
        .describe("SHA-256 hash of lockfile from voiceci_prepare_upload output. Enables dependency prebaking for instant subsequent runs."),
      adapter: AdapterTypeSchema.describe(
        "Transport: ws-voice (WebSocket), sip (phone via Plivo), webrtc (LiveKit), vapi (Vapi platform), retell (Retell platform via SIP + API), elevenlabs (ElevenLabs platform), bland (Bland platform via SIP + API)"
      ),
      platform: PlatformConfigSchema.optional().describe(
        "Platform config for vapi/retell/elevenlabs/bland adapters. Required for platform adapters."
      ),
      audio_tests: z
        .array(AudioTestNameSchema)
        .optional()
        .describe("Audio infrastructure tests to run."),
      conversation_tests: z
        .array(ConversationTestSpecSchema)
        .optional()
        .describe("Conversation behavioral tests to run."),
      start_command: z
        .string()
        .optional()
        .describe("Command to start the agent (default: npm run start). ws-voice only."),
      health_endpoint: z
        .string()
        .optional()
        .describe("Health check path (default: /health). ws-voice only."),
      agent_url: z
        .string()
        .optional()
        .describe("Agent base URL (default: http://localhost:3001). ws-voice only."),
      target_phone_number: z
        .string()
        .optional()
        .describe("Phone number to call. Required for sip, retell, and bland adapters."),
      voice: z
        .object({
          tts: z.object({ voice_id: z.string().optional() }).optional(),
          stt: z.object({ api_key_env: z.string().optional() }).optional(),
          silence_threshold_ms: z.number().optional(),
          webrtc: z.object({
            livekit_url_env: z.string().optional(),
            api_key_env: z.string().optional(),
            api_secret_env: z.string().optional(),
            room: z.string().optional(),
          }).optional(),
          telephony: z.object({
            auth_id_env: z.string().optional(),
            auth_token_env: z.string().optional(),
            from_number: z.string().optional(),
          }).optional(),
        })
        .optional()
        .describe("Voice configuration overrides."),
      audio_test_thresholds: AudioTestThresholdsSchema
        .describe("Override default pass/fail thresholds for audio tests. Omit to use defaults. Call voiceci_get_audio_test_reference for default values."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, async (
    {
      idempotency_key,
      adapter_config_id,
      bundle_key,
      bundle_hash,
      lockfile_hash,
      adapter: adapterParam,
      platform: platformParam,
      audio_tests,
      conversation_tests,
      start_command,
      health_endpoint,
      agent_url: agentUrlParam,
      target_phone_number: targetPhoneParam,
      voice: voiceParam,
      audio_test_thresholds,
    },
    extra,
  ) => {
    // Resolve adapter config if adapter_config_id is provided
    let adapter = adapterParam;
    let platform = platformParam;
    let agent_url = agentUrlParam;
    let target_phone_number = targetPhoneParam;
    let voice = voiceParam;

    if (adapter_config_id) {
      const stored = adapterConfigs.get(adapter_config_id);
      if (!stored) {
        return {
          content: [{
            type: "text" as const,
            text: `Error: adapter_config_id "${adapter_config_id}" not found. It may have expired (configs are per-session). Call voiceci_configure_adapter again.`,
          }],
          isError: true,
        };
      }
      if (!adapter) adapter = stored.adapter as typeof adapter;
      if (!platform) platform = stored.platform as typeof platform;
      agent_url = agent_url ?? stored.agent_url;
      target_phone_number = target_phone_number ?? stored.target_phone_number;
      if (!voice) voice = stored.voice as typeof voice;
    }

    // Validate at least one test
    if (
      (!audio_tests || audio_tests.length === 0) &&
      (!conversation_tests || conversation_tests.length === 0)
    ) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: At least one audio_test or conversation_test is required.",
          },
        ],
        isError: true,
      };
    }

    // Idempotency check — return existing run if key matches
    if (idempotency_key) {
      const [existing] = await app.db
        .select({ id: schema.runs.id, status: schema.runs.status })
        .from(schema.runs)
        .where(eq(schema.runs.idempotency_key, idempotency_key))
        .limit(1);

      if (existing) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ run_id: existing.id, status: existing.status, deduplicated: true }, null, 2),
            },
          ],
        };
      }
    }

    // Platform adapters are already deployed (the platform hosts the agent)
    const isPlatformAdapter = adapter === "vapi" || adapter === "retell" || adapter === "elevenlabs" || adapter === "bland";

    // Validate platform config for platform adapters
    if (isPlatformAdapter && !platform) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: platform config is required for ${adapter} adapter. Provide {provider, api_key_env, agent_id}.`,
          },
        ],
        isError: true,
      };
    }
    if (isPlatformAdapter && platform?.provider !== adapter) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: platform.provider must match adapter. Received adapter=${adapter}, provider=${platform?.provider ?? "undefined"}.`,
          },
        ],
        isError: true,
      };
    }
    if (!isPlatformAdapter && platform) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: platform config is only valid for platform adapters (vapi, retell, elevenlabs, bland). Received adapter=${adapter}.`,
          },
        ],
        isError: true,
      };
    }
    // Retell and Bland use SIP under the hood — require phone number + telephony config
    if ((adapter === "retell" || adapter === "bland") && !target_phone_number) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${adapter} adapter requires target_phone_number (the agent's phone number to dial via SIP).`,
          },
        ],
        isError: true,
      };
    }
    if ((adapter === "retell" || adapter === "bland") && !voice?.telephony?.from_number) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${adapter} adapter requires voice.telephony.from_number (the Plivo number to call from).`,
          },
        ],
        isError: true,
      };
    }

    // Validate env var references exist
    const missingEnvVars: string[] = [];
    if (voice?.stt?.api_key_env && !process.env[voice.stt.api_key_env]) {
      missingEnvVars.push(`voice.stt.api_key_env="${voice.stt.api_key_env}"`);
    }
    if (voice?.telephony?.auth_id_env && !process.env[voice.telephony.auth_id_env]) {
      missingEnvVars.push(`voice.telephony.auth_id_env="${voice.telephony.auth_id_env}"`);
    }
    if (voice?.telephony?.auth_token_env && !process.env[voice.telephony.auth_token_env]) {
      missingEnvVars.push(`voice.telephony.auth_token_env="${voice.telephony.auth_token_env}"`);
    }
    if (voice?.webrtc?.api_key_env && !process.env[voice.webrtc.api_key_env]) {
      missingEnvVars.push(`voice.webrtc.api_key_env="${voice.webrtc.api_key_env}"`);
    }
    if (voice?.webrtc?.api_secret_env && !process.env[voice.webrtc.api_secret_env]) {
      missingEnvVars.push(`voice.webrtc.api_secret_env="${voice.webrtc.api_secret_env}"`);
    }
    if (voice?.webrtc?.livekit_url_env && !process.env[voice.webrtc.livekit_url_env]) {
      missingEnvVars.push(`voice.webrtc.livekit_url_env="${voice.webrtc.livekit_url_env}"`);
    }
    if (platform?.api_key_env && !process.env[platform.api_key_env]) {
      missingEnvVars.push(`platform.api_key_env="${platform.api_key_env}"`);
    }
    if (missingEnvVars.length > 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: The following environment variables are referenced but not set on the server:\n${missingEnvVars.map(v => `  - ${v}`).join("\n")}\n\nCheck that the env var names are correct and that they are configured in the deployment environment.`,
          },
        ],
        isError: true,
      };
    }

    // Validate bundle for ws-voice (unless agent_url provided)
    const isAlreadyDeployed = isPlatformAdapter || adapter === "sip" || adapter === "webrtc" || !!agent_url;
    if (!isAlreadyDeployed && (!bundle_key || !bundle_hash)) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: bundle_key and bundle_hash are required for ws-voice adapter (unless agent_url is provided). Call voiceci_prepare_upload first.",
          },
        ],
        isError: true,
      };
    }

    const sourceType = isAlreadyDeployed ? "remote" : "bundle";
    const testSpec = { audio_tests, conversation_tests };

    // Single run for ALL tests
    const [run] = await app.db
      .insert(schema.runs)
      .values({
        api_key_id: apiKeyId,
        user_id: userId,
        source_type: sourceType,
        bundle_key: bundle_key ?? null,
        bundle_hash: bundle_hash ?? null,
        status: "queued",
        test_spec_json: testSpec,
        idempotency_key: idempotency_key ?? null,
      })
      .returning();

    const runId = run!.id;

    // All runs go through per-user queue — worker handles both
    // remote (direct execution) and bundled (Fly Machine) paths
    const queuedVoiceConfig = voice
      ? { adapter, target_phone_number, voice }
      : { adapter, target_phone_number };

    await app.getRunQueue(userId).add("execute-run", {
      run_id: runId,
      bundle_key: bundle_key ?? null,
      bundle_hash: bundle_hash ?? null,
      lockfile_hash: lockfile_hash ?? null,
      adapter,
      test_spec: testSpec,
      target_phone_number,
      voice_config: queuedVoiceConfig,
      audio_test_thresholds: audio_test_thresholds ?? null,
      start_command,
      health_endpoint,
      agent_url,
      platform: platform ?? null,
    });

    // Map run to this MCP session for push notifications
    if (extra.sessionId) {
      runToSession.set(runId, extra.sessionId);
    }

    // Store progressToken for notifications/progress delivery
    const progressToken = extra._meta?.progressToken;
    if (progressToken !== undefined) {
      runToProgress.set(runId, progressToken);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ run_id: runId }, null, 2),
        },
      ],
    };
  });

  // --- Tool: voiceci_load_test ---
  server.registerTool("voiceci_load_test", {
    title: "Run Load Test",
    description: "Run a load/stress test against an already-deployed voice agent. Sends N concurrent calls with a traffic pattern (ramp, spike, sustained, soak). Measures TTFB percentiles, error rates, and auto-detects breaking point. Results pushed via SSE as timeline snapshots every second. Only works with already-deployed agents (SIP, WebRTC, or ws-voice with agent_url).",
    inputSchema: {
      adapter_config_id: z
        .string()
        .uuid()
        .optional()
        .describe("Reusable adapter config ID from voiceci_configure_adapter. When provided, adapter/voice/target_phone_number/agent_url are resolved from the stored config."),
      adapter: AdapterTypeSchema.optional().describe("Transport: ws-voice, sip, or webrtc. Can be omitted if adapter_config_id is provided."),
      agent_url: z.string().optional().describe("URL of the already-deployed agent to test. Can be omitted if adapter_config_id is provided."),
      pattern: LoadPatternSchema.describe(
        "Traffic pattern: ramp (linear 0→target), spike (1→target instantly), sustained (full immediately), soak (slow ramp, long hold)"
      ),
      target_concurrency: z
        .number()
        .int()
        .min(1)
        .max(500)
        .describe("Maximum concurrent calls to maintain"),
      total_duration_s: z
        .number()
        .int()
        .min(10)
        .max(3600)
        .describe("Total test duration in seconds"),
      ramp_duration_s: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Duration of ramp-up phase in seconds (default: 30% of total_duration_s)"),
      caller_prompt: z
        .string()
        .min(1)
        .describe("What the simulated caller says. Pre-synthesized once and replayed for all callers."),
      target_phone_number: z
        .string()
        .optional()
        .describe("Phone number to call. Required for SIP adapter."),
      voice: z
        .object({
          tts: z.object({ voice_id: z.string().optional() }).optional(),
          stt: z.object({ api_key_env: z.string().optional() }).optional(),
          silence_threshold_ms: z.number().optional(),
          webrtc: z.object({
            livekit_url_env: z.string().optional(),
            api_key_env: z.string().optional(),
            api_secret_env: z.string().optional(),
            room: z.string().optional(),
          }).optional(),
          telephony: z.object({
            auth_id_env: z.string().optional(),
            auth_token_env: z.string().optional(),
            from_number: z.string().optional(),
          }).optional(),
        })
        .optional()
        .describe("Voice configuration overrides."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, async (
    {
      adapter_config_id,
      adapter: adapterParam,
      agent_url: agentUrlParam,
      pattern,
      target_concurrency,
      total_duration_s,
      ramp_duration_s,
      caller_prompt,
      target_phone_number: targetPhoneParam,
      voice: voiceParam,
    },
    extra,
  ) => {
    // Resolve adapter config if adapter_config_id is provided
    let adapter = adapterParam;
    let agent_url = agentUrlParam;
    let target_phone_number = targetPhoneParam;
    let voice = voiceParam;

    if (adapter_config_id) {
      const stored = adapterConfigs.get(adapter_config_id);
      if (!stored) {
        return {
          content: [{
            type: "text" as const,
            text: `Error: adapter_config_id "${adapter_config_id}" not found. It may have expired (configs are per-session). Call voiceci_configure_adapter again.`,
          }],
          isError: true,
        };
      }
      if (!adapter) adapter = stored.adapter as NonNullable<typeof adapter>;
      agent_url = agent_url ?? stored.agent_url;
      target_phone_number = target_phone_number ?? stored.target_phone_number;
      if (!voice) voice = stored.voice as typeof voice;
    }

    if (!adapter) {
      return {
        content: [{
          type: "text" as const,
          text: "Error: adapter is required. Provide it directly or via adapter_config_id.",
        }],
        isError: true,
      };
    }

    if (!agent_url) {
      return {
        content: [{
          type: "text" as const,
          text: "Error: agent_url is required for load tests. Provide it directly or via adapter_config_id.",
        }],
        isError: true,
      };
    }
    runLoadTestInProcess({
      channelConfig: {
        adapter,
        agentUrl: agent_url,
        targetPhoneNumber: target_phone_number,
        voice,
      },
      pattern,
      targetConcurrency: target_concurrency,
      totalDurationS: total_duration_s,
      rampDurationS: ramp_duration_s,
      callerPrompt: caller_prompt,
      sessionId: extra.sessionId,
      progressToken: extra._meta?.progressToken,
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "started",
            pattern,
            target_concurrency,
            total_duration_s,
            message: "Load test running. Results will be pushed via SSE as timeline snapshots every second, with a final summary when complete.",
          }, null, 2),
        },
      ],
    };
  });

  // --- Tool: voiceci_get_status ---
  server.registerTool("voiceci_get_status", {
    title: "Get Run Status",
    description: "Get the current status and results of a test run by ID. Use this to poll for results if SSE notifications are delayed or interrupted. Returns the run status, aggregate summary, and all individual test results once complete.",
    inputSchema: {
      run_id: z.string().uuid().describe("The run ID returned by voiceci_run_suite."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  }, async ({ run_id }) => {
    const [run] = await app.db
      .select()
      .from(schema.runs)
      .where(eq(schema.runs.id, run_id))
      .limit(1);

    if (!run) {
      return {
        content: [{ type: "text" as const, text: `Error: Run ${run_id} not found.` }],
        isError: true,
      };
    }

    // Still in progress — return status only
    if (run.status === "queued" || run.status === "running") {
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            run_id: run.id,
            status: run.status,
            started_at: run.started_at,
            message: run.status === "queued"
              ? "Run is queued, waiting for execution."
              : "Run is in progress. Poll again in a few seconds.",
          }, null, 2),
        }],
      };
    }

    // Completed (pass or fail) — return full results
    const scenarios = await app.db
      .select()
      .from(schema.scenarioResults)
      .where(eq(schema.scenarioResults.run_id, run_id));

    const audioResults = scenarios
      .filter((s) => s.test_type === "audio")
      .map((s) => s.metrics_json);
    const conversationResults = scenarios
      .filter((s) => s.test_type === "conversation")
      .map((s) => s.metrics_json);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          run_id: run.id,
          status: run.status,
          aggregate: run.aggregate_json,
          audio_results: audioResults,
          conversation_results: conversationResults,
          error_text: run.error_text ?? null,
          duration_ms: run.duration_ms,
          started_at: run.started_at,
          finished_at: run.finished_at,
        }, null, 2),
      }],
    };
  });
}
