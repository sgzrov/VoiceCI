/**
 * Judge LLM — evaluates conversation transcripts against eval questions.
 *
 * Uses Anthropic Sonnet for accuracy. Two-step evaluation:
 * 1. Relevancy: Is this eval question relevant to what happened in the conversation?
 * 2. Judgment: Did the agent pass or fail this criterion?
 *
 * The relevancy check exists because the caller LLM improvises, so the
 * conversation may not always cover the scenario the eval targets.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ConversationTurn, EvalResult } from "@voiceci/shared";

const MODEL = "claude-sonnet-4-6-20250514";
const MAX_TOKENS = 300;

function formatTranscript(transcript: ConversationTurn[]): string {
  return transcript
    .map((t) => `${t.role.toUpperCase()}: ${t.text}`)
    .join("\n");
}

export class JudgeLLM {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  /**
   * Evaluate a transcript against a list of eval questions.
   */
  async evaluate(
    transcript: ConversationTurn[],
    evalQuestions: string[]
  ): Promise<EvalResult[]> {
    const formattedTranscript = formatTranscript(transcript);
    const results: EvalResult[] = [];

    for (const question of evalQuestions) {
      const result = await this.evaluateQuestion(
        formattedTranscript,
        question
      );
      results.push(result);
    }

    return results;
  }

  private async evaluateQuestion(
    transcript: string,
    question: string
  ): Promise<EvalResult> {
    // Step 1: Relevancy check
    const relevancy = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0,
      system: `You are evaluating a voice agent conversation transcript. Determine if the following eval question is relevant to what actually happened in the conversation.

A question is RELEVANT if the conversation provides enough information to evaluate it. A question is NOT RELEVANT if the conversation topic never touched on the subject.

Respond with ONLY a JSON object: {"relevant": true/false, "reasoning": "brief explanation"}`,
      messages: [
        {
          role: "user",
          content: `TRANSCRIPT:\n${transcript}\n\nEVAL QUESTION: ${question}`,
        },
      ],
    });

    const relevancyText =
      relevancy.content[0]?.type === "text" ? relevancy.content[0].text : "";

    let relevant = true;
    let relevancyReasoning = "";
    try {
      const parsed = JSON.parse(relevancyText) as {
        relevant: boolean;
        reasoning: string;
      };
      relevant = parsed.relevant;
      relevancyReasoning = parsed.reasoning;
    } catch {
      // If parsing fails, assume relevant
      relevant = true;
    }

    if (!relevant) {
      return {
        question,
        relevant: false,
        passed: true, // Not relevant → not counted as failure
        reasoning: `Not relevant: ${relevancyReasoning}`,
      };
    }

    // Step 2: Judgment (only if relevant)
    const judgment = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0,
      system: `You are evaluating a voice agent's performance. Based on the transcript, determine if the agent PASSES or FAILS the given criterion.

Be strict but fair. The agent should demonstrate the expected behavior clearly.

Respond with ONLY a JSON object: {"passed": true/false, "reasoning": "brief explanation"}`,
      messages: [
        {
          role: "user",
          content: `TRANSCRIPT:\n${transcript}\n\nCRITERION: ${question}`,
        },
      ],
    });

    const judgmentText =
      judgment.content[0]?.type === "text" ? judgment.content[0].text : "";

    let passed = false;
    let judgmentReasoning = "";
    try {
      const parsed = JSON.parse(judgmentText) as {
        passed: boolean;
        reasoning: string;
      };
      passed = parsed.passed;
      judgmentReasoning = parsed.reasoning;
    } catch {
      passed = false;
      judgmentReasoning = "Failed to parse judge response";
    }

    return {
      question,
      relevant: true,
      passed,
      reasoning: judgmentReasoning,
    };
  }
}
