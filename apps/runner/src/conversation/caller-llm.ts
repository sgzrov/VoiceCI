/**
 * Caller LLM — generates dynamic caller utterances from a persona prompt.
 *
 * Uses Anthropic Haiku for speed. Maintains conversation history
 * and returns [END] when the conversation should conclude naturally.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ConversationTurn } from "@voiceci/shared";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 200;

const SYSTEM_PROMPT = `You are a simulated phone caller. Your persona and goals are defined in the user's first message.

Rules:
- Respond with ONLY your next spoken line — no stage directions, no quotes, no labels.
- Stay in character. Be natural and conversational.
- When the conversation has reached a natural conclusion or your goal is met, respond with exactly: [END]
- Keep responses concise (1-3 sentences max) — this is a phone call, not an essay.
- If the agent asks you to repeat or clarify, do so naturally.`;

export class CallerLLM {
  private client: Anthropic;
  private history: Array<{ role: "user" | "assistant"; content: string }> = [];
  private callerPrompt: string;

  constructor(callerPrompt: string) {
    this.client = new Anthropic();
    this.callerPrompt = callerPrompt;
  }

  /**
   * Generate the caller's next utterance based on the conversation so far.
   * Returns null if the caller has decided to end the conversation.
   */
  async nextUtterance(
    agentResponse: string | null,
    transcript: ConversationTurn[]
  ): Promise<string | null> {
    // Build user message
    if (this.history.length === 0) {
      // First turn: include the persona prompt
      this.history.push({
        role: "user",
        content: `Your persona and goal:\n${this.callerPrompt}\n\nYou are starting the phone call. Say your opening line.`,
      });
    } else if (agentResponse) {
      // Subsequent turns: agent's response becomes the user message
      this.history.push({
        role: "user",
        content: agentResponse,
      });
    }

    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.7,
      system: SYSTEM_PROMPT,
      messages: this.history,
    });

    const text =
      response.content[0]?.type === "text"
        ? response.content[0].text.trim()
        : "";

    // Add assistant response to history
    this.history.push({ role: "assistant", content: text });

    // Check for end signal
    if (text === "[END]" || text.includes("[END]")) {
      return null;
    }

    return text;
  }
}
