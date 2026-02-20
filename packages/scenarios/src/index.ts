import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { SuiteSchema } from "@voiceci/shared";
import type { Suite } from "@voiceci/shared";

export type { Scenario, Expectations, Suite } from "./types.js";

const DEMO_SUITE_DIR = resolve(
  __dirname,
  "../../../demo/suites"
);

export function loadScenarios(
  projectRoot: string,
  suitePath?: string
): Suite {
  if (suitePath) {
    const fullPath = resolve(projectRoot, suitePath);
    return loadSuiteFile(fullPath);
  }

  const localConfig = resolve(projectRoot, "voice-ci.json");
  if (existsSync(localConfig)) {
    const config = JSON.parse(readFileSync(localConfig, "utf-8"));
    if (config.suite) {
      const suiteFull = resolve(projectRoot, config.suite);
      if (existsSync(suiteFull)) {
        return loadSuiteFile(suiteFull);
      }
    }
  }

  const demoBasic = resolve(DEMO_SUITE_DIR, "basic.json");
  if (existsSync(demoBasic)) {
    return loadSuiteFile(demoBasic);
  }

  throw new Error(
    "No test suite found. Create a voice-ci.json or place suites in demo/suites/"
  );
}

function loadSuiteFile(filePath: string): Suite {
  if (!existsSync(filePath)) {
    throw new Error(`Suite file not found: ${filePath}`);
  }
  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  return validateSuite(parsed);
}

export function validateSuite(data: unknown): Suite {
  return SuiteSchema.parse(data);
}
