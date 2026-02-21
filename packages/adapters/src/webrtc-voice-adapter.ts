/**
 * WebRTC Voice Adapter (LiveKit)
 *
 * For testing voice agents built on LiveKit, Pipecat, or Daily.
 * Joins a LiveKit room, publishes TTS audio via AudioSource, and
 * reads the agent's audio via AudioStream.
 */

import {
  Room,
  RoomEvent,
  AudioSource,
  AudioStream,
  AudioFrame,
  LocalAudioTrack,
  TrackKind,
  TrackPublishOptions,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  dispose,
} from "@livekit/rtc-node";
import { AccessToken } from "livekit-server-sdk";
import {
  synthesize,
  transcribe,
  SilenceDetector,
  AudioRecorder,
  resample,
  type TTSConfig,
  type STTConfig,
} from "@voiceci/voice";
import type { AgentAdapter, AgentResponse } from "./types.js";

export interface WebRtcVoiceAdapterConfig {
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
  roomName: string;
  tts?: TTSConfig;
  stt?: STTConfig;
  silenceThresholdMs?: number;
  /** Sample rate for LiveKit audio. Default: 48000 */
  livekitSampleRate?: number;
}

export class WebRtcVoiceAdapter implements AgentAdapter {
  private config: WebRtcVoiceAdapterConfig;
  private room: Room | null = null;
  private audioSource: AudioSource | null = null;
  private localTrack: LocalAudioTrack | null = null;
  private livekitSampleRate: number;

  constructor(config: WebRtcVoiceAdapterConfig) {
    this.config = config;
    this.livekitSampleRate = config.livekitSampleRate ?? 48000;
  }

  async sendMessage(text: string): Promise<AgentResponse> {
    if (!this.room) {
      await this.connect();
    }

    const room = this.room!;

    // 1. TTS: text → PCM 24kHz → resample to LiveKit sample rate
    const pcm24k = await synthesize(text, this.config.tts);
    const pcmLk = resample(pcm24k, 24000, this.livekitSampleRate);

    // 2. Set up audio collection from agent's track
    const recorder = new AudioRecorder();
    const silenceDetector = new SilenceDetector({
      silenceThresholdMs: this.config.silenceThresholdMs ?? 1500,
    });

    let audioStreamReader: ReadableStreamDefaultReader<AudioFrame> | null =
      null;
    let collecting = true;

    const startCollecting = (track: RemoteTrack) => {
      const stream = new AudioStream(track, this.livekitSampleRate, 1);
      audioStreamReader = stream.getReader();

      const readLoop = async () => {
        try {
          while (collecting) {
            const { value: frame, done } = await audioStreamReader!.read();
            if (done || !frame) break;

            const frameBuffer = Buffer.from(
              frame.data.buffer,
              frame.data.byteOffset,
              frame.data.byteLength
            );
            const pcmChunk = resample(
              frameBuffer,
              this.livekitSampleRate,
              24000
            );
            recorder.push(pcmChunk);

            if (silenceDetector.process(pcmChunk)) {
              collecting = false;
              break;
            }
          }
        } catch {
          // Stream closed
        }
      };

      readLoop();
    };

    // Check existing subscribed audio tracks
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.trackPublications.values()) {
        if (pub.track && pub.kind === TrackKind.KIND_AUDIO) {
          startCollecting(pub.track as RemoteTrack);
        }
      }
    }

    // Listen for new audio track subscriptions
    const onTrackSubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      _participant: RemoteParticipant
    ) => {
      if (publication.kind === TrackKind.KIND_AUDIO) {
        startCollecting(track);
      }
    };
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);

    // 3. Publish TTS audio via AudioSource
    if (!this.audioSource) {
      this.audioSource = new AudioSource(this.livekitSampleRate, 1);
      this.localTrack = LocalAudioTrack.createAudioTrack(
        "voiceci-tester",
        this.audioSource
      );
      await room.localParticipant!.publishTrack(this.localTrack, new TrackPublishOptions());
    }

    // Send audio frame
    const samples = new Int16Array(
      pcmLk.buffer,
      pcmLk.byteOffset,
      pcmLk.length / 2
    );
    const frame = new AudioFrame(
      samples,
      this.livekitSampleRate,
      1,
      samples.length
    );
    await this.audioSource.captureFrame(frame);

    // 4. Wait for agent response (with timeout)
    const timeout = setTimeout(() => {
      collecting = false;
    }, 30_000);

    while (collecting) {
      await sleep(100);
    }
    clearTimeout(timeout);

    room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
    if (audioStreamReader) {
      (audioStreamReader as ReadableStreamDefaultReader<AudioFrame>)
        .cancel()
        .catch(() => {});
    }

    // 5. STT: collected audio → transcript
    const audioBuffer = recorder.getBuffer();
    let responseText = "";
    let confidence = 0;

    if (audioBuffer.length > 0) {
      const result = await transcribe(audioBuffer, this.config.stt);
      responseText = result.text;
      confidence = result.confidence;
    }

    return {
      text: responseText,
      latency_ms: recorder.getTimeToFirstByteMs() ?? 0,
      audio: audioBuffer,
      audio_duration_ms: recorder.getDurationMs(),
      stt_confidence: confidence,
      time_to_first_byte_ms: recorder.getTimeToFirstByteMs() ?? undefined,
    };
  }

  private async connect(): Promise<void> {
    const token = new AccessToken(
      this.config.apiKey,
      this.config.apiSecret,
      { identity: "voiceci-tester" }
    );
    token.addGrant({
      roomJoin: true,
      room: this.config.roomName,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await token.toJwt();

    this.room = new Room();
    await this.room.connect(this.config.livekitUrl, jwt);
  }

  async disconnect(): Promise<void> {
    if (this.audioSource) {
      await this.audioSource.close();
      this.audioSource = null;
    }
    if (this.localTrack) {
      await this.localTrack.close();
      this.localTrack = null;
    }
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
    dispose();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
