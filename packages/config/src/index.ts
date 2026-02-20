import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { VoiceCIConfig } from "@voiceci/shared";

const DEFAULT_CONFIG: VoiceCIConfig = {
  health_endpoint: "/health",
  start_command: "npm run start",
  adapter: "http",
  timeout_ms: 300_000,
};

export function loadConfig(projectRoot: string): VoiceCIConfig {
  const configPath = resolve(projectRoot, "voice-ci.json");

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<VoiceCIConfig>;

  return {
    ...DEFAULT_CONFIG,
    ...parsed,
  };
}

export function getEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function getEnvInt(key: string, fallback?: number): number {
  const raw = process.env[key];
  if (raw !== undefined) {
    const parsed = parseInt(raw, 10);
    if (isNaN(parsed)) throw new Error(`Invalid integer for ${key}: ${raw}`);
    return parsed;
  }
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable: ${key}`);
}

export function isDemoMode(): boolean {
  return process.env["DEMO_MODE"] === "true";
}
