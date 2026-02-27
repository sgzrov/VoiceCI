/**
 * sdk-pipeline — Full voice pipeline using @voiceci/sdk.
 *
 * Same pipeline as ws-llm (Deepgram STT → Claude Haiku → ElevenLabs TTS)
 * but wrapped with the SDK for a cleaner DX.
 *
 * Requires: DEEPGRAM_API_KEY, ELEVENLABS_API_KEY, ANTHROPIC_API_KEY
 */

import { VoiceCIServer } from "@voiceci/sdk";
import Anthropic from "@anthropic-ai/sdk";

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY!;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY!;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a restaurant booking agent for "La Bella Vita", an Italian restaurant.
You can help customers book tables, check availability, and answer questions about the menu.
Keep responses concise and conversational — you're on a phone call.

Available tools:
- book_table: Book a table. Parameters: date, time, party_size, name
- check_availability: Check availability. Parameters: date, time, party_size`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "book_table",
    description: "Book a table at the restaurant",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "Date (e.g. 2024-03-15)" },
        time: { type: "string", description: "Time (e.g. 19:00)" },
        party_size: { type: "number", description: "Number of guests" },
        name: { type: "string", description: "Name for the reservation" },
      },
      required: ["date", "time", "party_size", "name"],
    },
  },
  {
    name: "check_availability",
    description: "Check table availability",
    input_schema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "Date to check" },
        time: { type: "string", description: "Time to check" },
        party_size: { type: "number", description: "Number of guests" },
      },
      required: ["date", "time", "party_size"],
    },
  },
];

async function transcribe(pcm: Buffer): Promise<string> {
  const res = await fetch(
    "https://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=24000&channels=1",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": "application/octet-stream",
      },
      body: pcm,
    },
  );
  if (!res.ok) throw new Error(`Deepgram STT failed (${res.status})`);
  const data = (await res.json()) as { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> } };
  return data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
}

async function synthesize(text: string): Promise<Buffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=pcm_24000`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, model_id: "eleven_monolingual_v1" }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs TTS failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

function executeTool(name: string, args: Record<string, unknown>) {
  const start = Date.now();

  if (name === "book_table") {
    return {
      result: {
        confirmation_id: `BK-${Date.now().toString(36).toUpperCase()}`,
        ...args,
        status: "confirmed",
      },
      duration_ms: Date.now() - start,
      successful: true as const,
    };
  }

  if (name === "check_availability") {
    return {
      result: { available: true, ...args },
      duration_ms: Date.now() - start,
      successful: true as const,
    };
  }

  return { result: { error: "Unknown tool" }, duration_ms: Date.now() - start, successful: false as const };
}

// Per-connection conversation state
const conversations = new WeakMap<object, Anthropic.MessageParam[]>();

const server = new VoiceCIServer({
  port: Number(process.env.PORT) || 3001,

  onAudio: async (audio, { reportToolCall }) => {
    // Use audio buffer as key for per-connection state (connection is the WS)
    // In practice, each WS connection from VoiceCI is one test
    let history = conversations.get(audio) ?? [];

    const text = await transcribe(audio);
    if (!text.trim()) return;

    console.log(`[sdk-pipeline] user: ${text}`);
    history.push({ role: "user", content: text });

    let response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: history,
    });

    while (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const { result, duration_ms, successful } = executeTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
        );

        reportToolCall({
          name: toolUse.name,
          arguments: toolUse.input as Record<string, unknown>,
          result,
          successful,
          duration_ms,
        });

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: JSON.stringify(result),
        });
      }

      history.push({ role: "assistant", content: response.content });
      history.push({ role: "user", content: toolResults });

      response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: history,
      });
    }

    const assistantText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ");

    history.push({ role: "assistant", content: response.content });
    console.log(`[sdk-pipeline] agent: ${assistantText}`);

    const responsePcm = await synthesize(assistantText);
    return { audio: responsePcm };
  },
});

await server.start();
