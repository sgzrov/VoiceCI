import { HttpAdapter } from "./http-adapter.js";
import type { AgentAdapter } from "./http-adapter.js";

export type { AgentAdapter, AgentResponse } from "./http-adapter.js";
export { HttpAdapter } from "./http-adapter.js";

export function createAdapter(
  type: string,
  baseUrl: string
): AgentAdapter {
  switch (type) {
    case "http":
      return new HttpAdapter(baseUrl);
    default:
      throw new Error(`Unknown adapter type: ${type}`);
  }
}
