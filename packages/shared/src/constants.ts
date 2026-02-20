export const RUN_STATUSES = ["queued", "running", "pass", "fail"] as const;
export const SOURCE_TYPES = ["bundle"] as const;
export const SCENARIO_STATUSES = ["pass", "fail"] as const;
export const RUN_MODES = ["smoke", "ci", "deep"] as const;

export const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes
export const DEFAULT_HEALTH_TIMEOUT_MS = 60_000; // 1 minute
export const DEFAULT_HEALTH_INTERVAL_MS = 2_000;
export const DEFAULT_POLL_INTERVAL_MS = 3_000;
export const DEFAULT_AGENT_PORT = 3001;
export const DEFAULT_API_PORT = 3000;

export const RUNNER_CALLBACK_HEADER = "x-runner-secret";
