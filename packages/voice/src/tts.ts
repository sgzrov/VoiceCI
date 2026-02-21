/**
 * ElevenLabs TTS — converts text to PCM 16-bit 24kHz mono audio.
 */

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

  const res = await fetch(url, {
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

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(
      `ElevenLabs TTS failed (${res.status}): ${errorText}`
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
