import type { AdapterType, VoiceConfig } from "@voiceci/shared";
import type { AudioChannel } from "./audio-channel.js";
import { WsAudioChannel } from "./ws-audio-channel.js";
import { WebRtcAudioChannel } from "./webrtc-audio-channel.js";
import { SipAudioChannel } from "./sip-audio-channel.js";

export type { AudioChannel, AudioChannelEvents } from "./audio-channel.js";
export { BaseAudioChannel } from "./audio-channel.js";
export { WsAudioChannel } from "./ws-audio-channel.js";
export { WebRtcAudioChannel } from "./webrtc-audio-channel.js";
export { SipAudioChannel } from "./sip-audio-channel.js";

export interface AudioChannelConfig {
  adapter: AdapterType;
  agentUrl?: string;
  targetPhoneNumber?: string;
  voice?: VoiceConfig;
}

export function createAudioChannel(config: AudioChannelConfig): AudioChannel {
  const agentUrl = config.agentUrl ?? "http://localhost:3001";

  switch (config.adapter) {
    case "ws-voice":
      return new WsAudioChannel({
        wsUrl: agentUrl.replace(/^http/, "ws"),
      });

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

      return new WebRtcAudioChannel({
        livekitUrl,
        apiKey,
        apiSecret,
        roomName,
      });
    }

    case "sip": {
      const telephony = config.voice?.telephony;
      const authId =
        process.env[telephony?.auth_id_env ?? "PLIVO_AUTH_ID"] ?? "";
      const authToken =
        process.env[telephony?.auth_token_env ?? "PLIVO_AUTH_TOKEN"] ?? "";
      const publicHost = process.env["RUNNER_PUBLIC_HOST"] ?? "localhost";

      if (!config.targetPhoneNumber) {
        throw new Error("SIP adapter requires targetPhoneNumber");
      }
      if (!telephony?.from_number) {
        throw new Error("SIP adapter requires voice.telephony.from_number");
      }

      return new SipAudioChannel({
        phoneNumber: config.targetPhoneNumber,
        fromNumber: telephony.from_number,
        authId,
        authToken,
        publicHost,
      });
    }

    default:
      throw new Error(`Unknown adapter type: ${config.adapter}`);
  }
}
