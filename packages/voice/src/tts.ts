/**
 * ElevenLabs TTS — converts text to PCM 16-bit 24kHz mono audio.
 */

import { withRetry } from "@voiceci/shared";

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_VOICE_ID = "pNInz6obpgDQGcFmaJgB"; // "Adam"

export interface TTSConfig {
  voiceId?: string;
  apiKeyEnv?: string;
}

export async function synthesize(
  text: string,
  config?: TTSConfig
): Promise<Buffer> {
  const apiKey = process.env[config?.apiKeyEnv ?? "ELEVENLABS_API_KEY"];
  if (!apiKey) {
    throw new Error(
      `Missing ElevenLabs API key (env: ${config?.apiKeyEnv ?? "ELEVENLABS_API_KEY"})`
    );
  }

  const voiceId = config?.voiceId ?? DEFAULT_VOICE_ID;
  const url = `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}?output_format=pcm_24000`;

  const res = await withRetry(async () => {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
      }),
    });

    if (!r.ok) {
      if (r.status === 408 || r.status === 429 || r.status >= 500) {
        throw Object.assign(
          new Error(`ElevenLabs TTS retryable (${r.status})`),
          { retryable: true },
        );
      }
      const errorText = await r.text();
      throw new Error(`ElevenLabs TTS failed (${r.status}): ${errorText}`);
    }
    return r;
  });

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
