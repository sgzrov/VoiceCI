/**
 * Deepgram STT — transcribes PCM 16-bit 24kHz mono audio to text.
 */

import type { TranscriptionResult } from "./types.js";

const DEEPGRAM_BASE_URL = "https://api.deepgram.com/v1";

export interface STTConfig {
  apiKeyEnv?: string;
  sampleRate?: number;
}

export async function transcribe(
  audio: Buffer,
  config?: STTConfig
): Promise<TranscriptionResult> {
  const apiKey = process.env[config?.apiKeyEnv ?? "DEEPGRAM_API_KEY"];
  if (!apiKey) {
    throw new Error(
      `Missing Deepgram API key (env: ${config?.apiKeyEnv ?? "DEEPGRAM_API_KEY"})`
    );
  }

  const sampleRate = config?.sampleRate ?? 24000;
  const url = `${DEEPGRAM_BASE_URL}/listen?encoding=linear16&sample_rate=${sampleRate}&channels=1`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Token ${apiKey}`,
      "Content-Type": "application/octet-stream",
    },
    body: audio,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Deepgram STT failed (${res.status}): ${errorText}`);
  }

  const data = (await res.json()) as DeepgramResponse;
  const alt = data.results?.channels?.[0]?.alternatives?.[0];

  return {
    text: alt?.transcript ?? "",
    confidence: alt?.confidence ?? 0,
  };
}

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
      }>;
    }>;
  };
}
