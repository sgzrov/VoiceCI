export interface AudioConfig {
  encoding: "linear16";
  sampleRate: number;
  channels: number;
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
}

export const DEFAULT_AUDIO_CONFIG: AudioConfig = {
  encoding: "linear16",
  sampleRate: 24000,
  channels: 1,
};

/** Bytes per second for the default audio config (24kHz, 16-bit, mono) */
export const BYTES_PER_SECOND = 24000 * 2 * 1; // 48000
