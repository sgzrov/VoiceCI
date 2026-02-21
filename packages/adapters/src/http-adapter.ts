import type { AgentAdapter, AgentResponse } from "./types.js";

export class HttpAdapter implements AgentAdapter {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async sendMessage(text: string): Promise<AgentResponse> {
    const start = performance.now();

    let response = await this.tryEndpoint("/message", { text });

    if (!response.ok && response.status === 404) {
      response = await this.tryEndpoint("/chat", { text });
    }

    if (!response.ok) {
      throw new Error(
        `Agent returned ${response.status}: ${await response.text()}`
      );
    }

    const latency_ms = Math.round(performance.now() - start);
    const body = (await response.json()) as Record<string, unknown>;
    const responseText =
      typeof body["text"] === "string"
        ? body["text"]
        : typeof body["message"] === "string"
          ? body["message"]
          : typeof body["response"] === "string"
            ? body["response"]
            : JSON.stringify(body);

    return { text: responseText, latency_ms };
  }

  private async tryEndpoint(
    path: string,
    body: Record<string, unknown>
  ): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}
