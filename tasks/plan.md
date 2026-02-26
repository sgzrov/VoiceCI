# MCP Integration: Making It More Seamless

## Status: Research Complete, Ready for Implementation

---

## Current State Assessment

### Architecture
- **MCP Server**: `apps/api/src/routes/mcp.ts` (1,169 lines)
- **5 tools**: `get_testing_docs`, `prepare_upload`, `run_suite`, `load_test`, `get_run_status`
- **Transport**: StreamableHTTPServerTransport (correct, spec-aligned)
- **Session management**: Per-session MCP servers + transports, `Mcp-Session-Id` routing
- **Results delivery**: `sendLoggingMessage()` over SSE (logging sideband, not ideal)
- **0 Resources, 0 Prompts**: Tools-only surface

### What Works Well
- Streamable HTTP transport is correct per June 2025 spec
- Session management with `runToSession` map for push notifications is solid
- Tool annotations (`readOnlyHint`, `idempotentHint`, `destructiveHint`) are properly set
- Per-user BullMQ queue isolation prevents resource starvation
- Bundle reusability via `bundle_key` / `bundle_hash` / `lockfile_hash` is elegant

---

## Recommendations

### 1. Rename Tools with `voiceci_` Prefix

**Priority**: Now | **Effort**: Low | **Impact**: Medium

Current names (`get_testing_docs`, `run_suite`, etc.) risk collision when users have multiple MCP servers. The emerging convention from Philipp Schmid's MCP best practices guide is `{service}_{action}_{resource}`.

**Rename map:**
| Current | New |
|---------|-----|
| `get_testing_docs` | `voiceci_get_docs` |
| `prepare_upload` | `voiceci_prepare_upload` |
| `run_suite` | `voiceci_run_suite` |
| `load_test` | `voiceci_load_test` |
| `get_run_status` | `voiceci_get_status` |

Add `title` field for human-readable names (e.g., `title: "Run Test Suite"`).

**Note**: The MCP server name is already `{ name: "voiceci" }`, which helps with disambiguation. The prefix is defense-in-depth.

---

### 2. Split `get_testing_docs` into Focused Tools

**Priority**: Now | **Effort**: Low | **Impact**: High

Current `TESTING_DOCS` is 571 lines / ~9,400 tokens returned in a single tool call. Per MCP best practices: "Every element — tool count, parameter complexity, response verbosity, error messaging — directly impacts agent reliability."

**Split into:**
| Tool | Content | ~Lines |
|------|---------|--------|
| `voiceci_get_audio_test_reference` | 6-test table + threshold defaults + audio analysis metrics | ~60 |
| `voiceci_get_scenario_guide` | Agent analysis steps, code-to-scenario mapping, 7 persona archetypes, writing conversation tests | ~200 |
| `voiceci_get_eval_examples` | Eval question patterns, red-teaming & security testing, tool call testing | ~150 |
| `voiceci_get_result_guide` | Interpreting results, iterative testing, regression testing, production failures | ~100 |

Claude calls only the sections needed for the current task. A developer debugging a failing echo test doesn't need the red-teaming guide.

**Additionally**: Consider returning `resource_link` items in tool results. Per the June 2025 spec, tools can return `{ type: "resource_link", uri: "voiceci://docs/scenario-guide" }` for deferred deep-dive content.

**Why not an MCP Resource?** Resources are "application-driven" — the host decides when to include them. Claude Code doesn't proactively fetch Resources into context, so moving docs to a Resource would mean Claude never sees them unless explicitly supported by the client.

---

### 3. Add `idempotency_key` to `run_suite`

**Priority**: Now | **Effort**: Low | **Impact**: Low

`run_suite` creates a new DB row on every call. If Claude retries due to a network blip, a duplicate run is created. The tool already has `idempotentHint: false`, but client behavior varies.

**Implementation:**
- Add optional `idempotency_key: z.string().uuid().optional()` parameter to `run_suite`
- Add `idempotency_key` column to `schema.runs` with unique index
- On insert: if `idempotency_key` conflicts, return existing `run_id` instead of creating new run
- Simple upsert-on-conflict pattern

---

### 4. Use `notifications/progress` Instead of `sendLoggingMessage`

**Priority**: Next sprint | **Effort**: Medium | **Impact**: High

Current results delivery uses `sendLoggingMessage` with `logger: "voiceci:test-result"`. This is semantically a diagnostic logging channel, not structured data delivery.

The MCP spec defines `notifications/progress` with `progressToken`, `progress`, `total`, and `message` — designed for exactly this use case.

**Implementation:**
- When `run_suite` is called, check for `_meta.progressToken` in the request
- Wire `onTestComplete` callback to `notifications/progress`:
  ```
  progress: completedTests / totalTests
  message: "echo: pass (152ms) | ttfb: p95=1200ms"
  ```
- Keep `get_run_status` as polling fallback (already works)
- For load tests, use progress notifications for per-second timepoint updates

**Caveat**: Verify that Claude Code actually surfaces `notifications/progress` to the model before investing heavily. Test empirically. If it doesn't, keep using `sendLoggingMessage` but rename the logger to clearly signal "test result, not debug log."

**Don't adopt MCP Tasks yet** — they're experimental in the November 2025 spec and Claude Code doesn't support them. But architecturally, Tasks are the future for long-running test runs.

---

### 5. Add MCP Prompts for Agent Analysis + Test Suggestion

**Priority**: Next sprint | **Effort**: Medium | **Impact**: High

Two new features:

#### 5a. `voiceci_suggest_config` Tool

Claude reads the user's codebase, extracts structure, and sends a structured payload to VoiceCI:

```typescript
{
  system_prompt: string,        // The agent's system prompt text
  tools: Array<{               // Tool/function definitions found
    name: string,
    params: string[],
    description?: string
  }>,
  adapter_hint: AdapterType,   // Detected or specified adapter
  has_auth: boolean,           // Whether agent has auth/verification logic
  has_compliance: boolean,     // Whether agent has compliance/disclosure requirements
  constraints?: string[]       // Any other notable constraints
}
```

VoiceCI returns an optimized test configuration:
```typescript
{
  recommended_audio_tests: AudioTestName[],
  conversation_tests: ConversationTestSpec[],
  adapter: AdapterType,
  voice_config?: Partial<VoiceConfig>,
  reasoning: string,           // Why these tests were chosen
  ready_to_run: true
}
```

**Domain knowledge approach**: Use an LLM call (Haiku) inside the server with TESTING_DOCS as context. Single source of truth — when TESTING_DOCS is updated, suggestions automatically reflect the changes. Cache responses keyed on `{adapter, tool_count, has_auth, has_compliance}` with 24h TTL.

**Alternative for v1**: Instead of server-side LLM, return a deterministic rule mapping:
```json
{
  "sip": { "always": ["echo", "ttfb", "barge_in"], "if_phone": ["silence_handling"] },
  "ws-voice": { "always": ["echo", "ttfb", "connection_stability"] },
  ...
}
```
Start with rules, add LLM path later for complex agents.

**The key design principle**: Output is a *suggestion*, not a locked config. Claude presents it to the user for review/modification before passing to `run_suite`.

**Target flow** (3 turns, down from 6-8):
1. Claude explores codebase, extracts structure
2. `voiceci_suggest_config(structured_payload)` → suggested test suite
3. Claude presents: "Here's what I'd test. Want to adjust?" → user approves → `voiceci_run_suite(final_config)`

#### 5b. MCP Prompt for Agent Analysis

Define an MCP Prompt (`voiceci://prompts/analyze-agent`) that gives Claude structured instructions for exploring the codebase. This standardizes the analysis step without requiring server-side file access.

---

### 6. Refactor `voice` / `platform` into `configure_adapter`

**Priority**: After validation | **Effort**: Medium | **Impact**: Medium

The `voice` object is deeply nested (5 optional sub-objects with env var references). The `platform` object adds platform-specific config. Most calls use zero of these nested fields.

**Approach**: Move voice/platform/telephony config into a `voiceci_configure_adapter` tool that returns a reusable `adapter_config_id`. Claude configures once, references in multiple `run_suite` calls.

**Alternative**: Use Zod discriminated unions on `adapter` so Claude sees only relevant params for the chosen adapter type.

---

### 7. Per-Test Streaming from Remote Runs

**Priority**: After #4 is done | **Effort**: High | **Impact**: Medium

Currently, remote runs (via worker/Fly Machine) send a single callback with all results at the end. Individual test completions aren't streamed.

**Implementation**: Have the runner send per-test callbacks to the API, which forwards as progress notifications to the MCP session.

---

## Follow-Up Analysis

### Domain Knowledge Maintenance for `suggest_config`

The cold start / dual-source-of-truth problem: if domain knowledge is hard-coded in `suggest_config`, it drifts from TESTING_DOCS.

**Recommendation**: Use a server-side LLM call (Haiku) with TESTING_DOCS as context.

- **Latency**: 2-5s per call. Acceptable — removes 3-4 Claude turns. Net time savings is positive.
- **Cost**: ~9K input tokens + ~500 token payload. Haiku: fractions of a cent per call.
- **Maintenance**: TESTING_DOCS becomes the single source of truth. Update docs → suggestions automatically reflect changes.
- **Non-determinism risk**: Acceptable since output is a suggestion, not auto-executed.
- **Optimization**: Cache responses keyed on `{adapter, tool_count, has_auth, has_compliance}` with 24h TTL.

**v1 alternative**: Deterministic rule mapping (adapter → test list). Covers 90% of cases, zero latency, fully predictable. Add LLM path later for complex agents.

### Minimal CLI Surface

Existing infra supports a thin CLI wrapper over REST endpoints:

```
voiceci run <config-file>     # Run tests from voice-ci.json (POST run + queue)
voiceci run --adapter sip \   # Inline config
  --phone +1234567890 \
  --audio echo,ttfb
voiceci status <run-id>       # Poll for results (GET /runs/:id)
voiceci upload <project-root> # Bundle + upload (POST /uploads)
voiceci results <run-id>      # Full results with metrics
voiceci auth <api-key>        # Store API key in ~/.voiceci
```

**CI/CD requirements:**
- Exit codes: 0 on all-pass, 1 on any failure
- `--wait` flag to block until completion (poll loop)
- `--json` flag for machine-readable output
- GitHub Actions example:
  ```yaml
  - run: voiceci run voice-ci.json --wait
    env:
      VOICECI_API_KEY: ${{ secrets.VOICECI_API_KEY }}
  ```

**Infra gap**: Need a synchronous/long-polling REST endpoint or webhook-based completion signal. Current flow is async (queue + SSE push).

The `VoiceCIConfigSchema` (`schemas.ts:249-270`) already defines the project config format for voice-ci.json files.

### Secrets Handling: The `_env` Pattern

The current pattern (`api_key_env: "DEEPGRAM_API_KEY"` — pass env var name, not the value) is good MCP hygiene.

**Why it's good:**
1. Secrets never enter the LLM context. Claude sees `"DEEPGRAM_API_KEY"`, not the actual key.
2. Explicit about what's needed. The env var name is documentation.
3. Works with existing deployment patterns (Fly Machines, Docker, CI all support env vars natively).

**Alternatives considered:**
- Passing actual secrets in tool calls: Terrible. Appears in conversation history, leaks via prompt injection.
- Server-side secret management (vault/KMS): Better security but requires UI + management flow. Good for v2/dashboard.
- MCP OAuth scopes: Most spec-aligned but requires OAuth flow implementation.

**Improvement needed**: Validate that env vars actually exist at `run_suite` time, not downstream in the worker. Currently, a hallucinated env var name (e.g., `"DEEPGRAM_KEY"` instead of `"DEEPGRAM_API_KEY"`) silently resolves to `undefined`. Add server-side validation with a clear error message.

**Long-term**: When building the dashboard, transition to `credential_id` pattern: `stt: { credential_id: "cred_abc123" }`.

---

## Competitive Context

| Platform | Moat | MCP? | CLI/CI? |
|----------|------|------|---------|
| **Hamming** | Auto-generates scenarios from prompts, 50+ metrics, production replay | No | Yes (SOC 2, CI/CD) |
| **Roark** | Production call replay, one-click VAPI/Retell/LiveKit integration | No | Yes (Node/Python SDK) |
| **Coval** | Permutation testing, Waymo-pedigree rigor, custom metrics | No | Yes (Python SDK, CI/CD) |
| **VoiceCI** | MCP-native Claude integration, codebase-aware test design | **Yes** | Not yet |

**Strategic positioning**: MCP-native is the primary DX (moat — competitors would have to build from scratch). REST API / CLI for CI/CD (table stakes — non-negotiable for adoption). The MCP angle differentiates on *test authoring*, not execution. CI/CD differentiates on *regression gating*, not authoring.

**Bottom line**: Keep MCP as the primary DX, add REST API / CLI for CI/CD, position as "AI-native test design, runs anywhere."

---

## Priority Matrix

| # | Change | Effort | Impact | When |
|---|--------|--------|--------|------|
| 1 | Rename tools with `voiceci_` prefix | Low | Medium | Now |
| 2 | Split `get_testing_docs` into focused tools | Low | High | Now |
| 3 | Add `idempotency_key` to `run_suite` | Low | Low | Now |
| 4 | Use `notifications/progress` instead of `sendLoggingMessage` | Medium | High | Next sprint |
| 5 | Add `voiceci_suggest_config` tool + MCP Prompt | Medium | High | Next sprint |
| 6 | Refactor `voice`/`platform` into `configure_adapter` | Medium | Medium | After validation |
| 7 | Per-test streaming from remote runs | High | Medium | After #4 |
| 8 | REST API / CLI for CI/CD | Medium | High | Parallel track |
| 9 | Env var existence validation at `run_suite` time | Low | Medium | Now |

---

## Sources

- [MCP Specification 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [MCP Resources Spec](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)
- [MCP Tools Spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP Best Practices — Philipp Schmid](https://www.philschmid.de/mcp-best-practices)
- [MCP Best Practices — Peter Steinberger](https://steipete.me/posts/2025/mcp-best-practices)
- [MCP Tool Naming — SEP-986](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/986)
- [GitHub MCP Server Naming — Issue #333](https://github.com/github/github-mcp-server/issues/333)
- [Hamming AI](https://hamming.ai/)
- [Roark AI Docs](https://docs.roark.ai/documentation/integrations/overview)
- [Coval Voice AI Testing](https://www.coval.dev/voice-ai-testing)
