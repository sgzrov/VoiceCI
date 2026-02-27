/**
 * ws-llm — Full voice pipeline over ws-voice protocol.
 *
 * Deepgram STT → Claude Haiku → ElevenLabs TTS
 * Reports tool calls as JSON text frames.
 *
 * Requires: DEEPGRAM_API_KEY, ELEVENLABS_API_KEY, ANTHROPIC_API_KEY
 *
 * Protocol:
 *   Binary in  = PCM 16-bit 24kHz mono (from VoiceCI runner)
 *   Binary out = PCM 16-bit 24kHz mono (agent response)
 *   Text out   = JSON { type: "tool_call", name, arguments, result, successful, duration_ms }
 *   GET /health = { status: "ok" }
 */

import http from "node:http";
import { WebSocketServer } from "ws";
import Anthropic from "@anthropic-ai/sdk";

const PORT = process.env.PORT || 3001;
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are a restaurant booking agent for "La Bella Vita", an Italian restaurant.
You can help customers book tables, check availability, and answer questions about the menu.
Keep responses concise and conversational — you're on a phone call.

Available tools:
- book_table: Book a table. Parameters: date (string), time (string), party_size (number), name (string)
- check_availability: Check table availability. Parameters: date (string), time (string), party_size (number)

When the customer wants to book, use the tools and confirm the booking.`;

const TOOLS = [
  {
    name: "book_table",
    description: "Book a table at the restaurant",
    input_schema: {
      type: "object",
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
      type: "object",
      properties: {
        date: { type: "string", description: "Date to check" },
        time: { type: "string", description: "Time to check" },
        party_size: { type: "number", description: "Number of guests" },
      },
      required: ["date", "time", "party_size"],
    },
  },
];

// ---- STT (Deepgram) ----

async function transcribe(pcm) {
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
  const data = await res.json();
  return data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
}

// ---- TTS (ElevenLabs) ----

async function synthesize(text) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=pcm_24000`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
      }),
    },
  );

  if (!res.ok) throw new Error(`ElevenLabs TTS failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

// ---- Tool execution (mock) ----

function executeTool(name, args) {
  const start = Date.now();
  let result;

  if (name === "book_table") {
    result = {
      confirmation_id: `BK-${Date.now().toString(36).toUpperCase()}`,
      date: args.date,
      time: args.time,
      party_size: args.party_size,
      name: args.name,
      status: "confirmed",
    };
  } else if (name === "check_availability") {
    result = {
      available: true,
      date: args.date,
      time: args.time,
      party_size: args.party_size,
      alternatives: [`${args.time.split(":")[0]}:30`],
    };
  } else {
    result = { error: "Unknown tool" };
  }

  return { result, duration_ms: Date.now() - start, successful: true };
}

// ---- Server ----

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("[ws-llm] connection opened");
  const conversationHistory = [];

  ws.on("message", async (data, isBinary) => {
    if (!isBinary) return;

    const pcm = data instanceof Buffer ? data : Buffer.from(data);

    try {
      // STT
      const text = await transcribe(pcm);
      if (!text.trim()) return;

      console.log(`[ws-llm] user: ${text}`);
      conversationHistory.push({ role: "user", content: text });

      // LLM
      let response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: conversationHistory,
      });

      // Handle tool use loop
      while (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
        const toolResults = [];

        for (const toolUse of toolUseBlocks) {
          const { result, duration_ms, successful } = executeTool(toolUse.name, toolUse.input);

          // Report tool call to VoiceCI
          ws.send(
            JSON.stringify({
              type: "tool_call",
              name: toolUse.name,
              arguments: toolUse.input,
              result,
              successful,
              duration_ms,
            }),
          );

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        }

        conversationHistory.push({ role: "assistant", content: response.content });
        conversationHistory.push({ role: "user", content: toolResults });

        response = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          system: SYSTEM_PROMPT,
          tools: TOOLS,
          messages: conversationHistory,
        });
      }

      const assistantText = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join(" ");

      conversationHistory.push({ role: "assistant", content: response.content });
      console.log(`[ws-llm] agent: ${assistantText}`);

      // TTS
      const audioPcm = await synthesize(assistantText);
      ws.send(audioPcm);
    } catch (err) {
      console.error("[ws-llm] error:", err.message);
    }
  });

  ws.on("close", () => {
    console.log("[ws-llm] connection closed");
  });
});

server.listen(PORT, () => {
  console.log(`[ws-llm] listening on port ${PORT}`);
});
