import type { VoiceCIConfig } from "@voiceci/shared";
import type { TTSConfig, STTConfig } from "@voiceci/voice";
import { HttpAdapter } from "./http-adapter.js";
import { WsVoiceAdapter } from "./ws-voice-adapter.js";
import { SipVoiceAdapter } from "./sip-voice-adapter.js";
import { WebRtcVoiceAdapter } from "./webrtc-voice-adapter.js";
import type { AgentAdapter } from "./types.js";

export type { AgentAdapter, AgentResponse } from "./types.js";
export { HttpAdapter } from "./http-adapter.js";
export { WsVoiceAdapter } from "./ws-voice-adapter.js";
export { SipVoiceAdapter } from "./sip-voice-adapter.js";
export { WebRtcVoiceAdapter } from "./webrtc-voice-adapter.js";

function getTtsConfig(config: VoiceCIConfig): TTSConfig {
  return {
    voiceId: config.voice?.tts?.voice_id,
    apiKeyEnv: config.voice?.tts?.api_key_env,
  };
}

function getSttConfig(config: VoiceCIConfig): STTConfig {
  return {
    apiKeyEnv: config.voice?.stt?.api_key_env,
    sampleRate: config.voice?.audio?.sample_rate,
  };
}

export function createAdapter(config: VoiceCIConfig): AgentAdapter {
  const adapterType = config.adapter ?? "http";
  const agentUrl = config.agent_url ?? "http://localhost:3001";

  switch (adapterType) {
    case "http":
      return new HttpAdapter(agentUrl);

    case "ws-voice":
      return new WsVoiceAdapter({
        wsUrl: agentUrl.replace(/^http/, "ws"),
        tts: getTtsConfig(config),
        stt: getSttConfig(config),
        silenceThresholdMs: config.voice?.silence_threshold_ms,
      });

    case "sip": {
      const telephony = config.voice?.telephony;
      const authId =
        process.env[telephony?.auth_id_env ?? "PLIVO_AUTH_ID"] ?? "";
      const authToken =
        process.env[telephony?.auth_token_env ?? "PLIVO_AUTH_TOKEN"] ?? "";
      const publicHost = process.env["RUNNER_PUBLIC_HOST"] ?? "localhost";

      if (!config.target_phone_number) {
        throw new Error("SIP adapter requires target_phone_number in config");
      }
      if (!telephony?.from_number) {
        throw new Error("SIP adapter requires voice.telephony.from_number");
      }

      return new SipVoiceAdapter({
        phoneNumber: config.target_phone_number,
        fromNumber: telephony.from_number,
        authId,
        authToken,
        publicHost,
        tts: getTtsConfig(config),
        stt: getSttConfig(config),
        silenceThresholdMs: config.voice?.silence_threshold_ms,
      });
    }

    case "webrtc": {
      const webrtc = config.voice?.webrtc;
      const livekitUrl =
        process.env[webrtc?.livekit_url_env ?? "LIVEKIT_URL"] ?? "";
      const apiKey =
        process.env[webrtc?.api_key_env ?? "LIVEKIT_API_KEY"] ?? "";
      const apiSecret =
        process.env[webrtc?.api_secret_env ?? "LIVEKIT_API_SECRET"] ?? "";

      const roomName =
        webrtc?.room ??
        `voiceci-${process.env["RUN_ID"] ?? crypto.randomUUID().slice(0, 8)}`;

      return new WebRtcVoiceAdapter({
        livekitUrl,
        apiKey,
        apiSecret,
        roomName,
        tts: getTtsConfig(config),
        stt: getSttConfig(config),
        silenceThresholdMs: config.voice?.silence_threshold_ms,
      });
    }

    default:
      throw new Error(`Unknown adapter type: ${adapterType}`);
  }
}
