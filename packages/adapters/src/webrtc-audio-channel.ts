/**
 * WebRTC Audio Channel (LiveKit)
 *
 * Joins a LiveKit room, publishes audio via AudioSource, and
 * receives agent audio via AudioStream. Handles 24kHz <-> 48kHz
 * resampling internally (LiveKit uses 48kHz by default).
 *
 * Extracted from webrtc-voice-adapter.ts — no TTS/STT/silence logic.
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
import { resample } from "@voiceci/voice";
import { BaseAudioChannel } from "./audio-channel.js";

export interface WebRtcAudioChannelConfig {
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
  roomName: string;
  /** Sample rate for LiveKit audio. Default: 48000 */
  livekitSampleRate?: number;
}

export class WebRtcAudioChannel extends BaseAudioChannel {
  private config: WebRtcAudioChannelConfig;
  private room: Room | null = null;
  private audioSource: AudioSource | null = null;
  private localTrack: LocalAudioTrack | null = null;
  private livekitSampleRate: number;
  private collecting = false;

  constructor(config: WebRtcAudioChannelConfig) {
    super();
    this.config = config;
    this.livekitSampleRate = config.livekitSampleRate ?? 48000;
  }

  get connected(): boolean {
    return this.room !== null;
  }

  async connect(): Promise<void> {
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
    this.collecting = true;

    // Set up audio source for publishing
    this.audioSource = new AudioSource(this.livekitSampleRate, 1);
    this.localTrack = LocalAudioTrack.createAudioTrack(
      "voiceci-tester",
      this.audioSource
    );
    await this.room.localParticipant!.publishTrack(
      this.localTrack,
      new TrackPublishOptions()
    );

    // Subscribe to existing remote audio tracks
    for (const participant of this.room.remoteParticipants.values()) {
      for (const pub of participant.trackPublications.values()) {
        if (pub.track && pub.kind === TrackKind.KIND_AUDIO) {
          this.startReadingTrack(pub.track as RemoteTrack);
        }
      }
    }

    // Subscribe to new remote audio tracks
    this.room.on(
      RoomEvent.TrackSubscribed,
      (track: RemoteTrack, pub: RemoteTrackPublication, _p: RemoteParticipant) => {
        if (pub.kind === TrackKind.KIND_AUDIO) {
          this.startReadingTrack(track);
        }
      }
    );
  }

  sendAudio(pcm: Buffer): void {
    if (!this.audioSource) {
      throw new Error("WebRTC not connected");
    }

    // Resample 24kHz → LiveKit sample rate
    const resampled = resample(pcm, 24000, this.livekitSampleRate);
    const samples = new Int16Array(
      resampled.buffer,
      resampled.byteOffset,
      resampled.length / 2
    );
    const frame = new AudioFrame(
      samples,
      this.livekitSampleRate,
      1,
      samples.length
    );
    this.audioSource.captureFrame(frame);
  }

  async disconnect(): Promise<void> {
    this.collecting = false;
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

  private startReadingTrack(track: RemoteTrack): void {
    const stream = new AudioStream(track, this.livekitSampleRate, 1);
    const reader = stream.getReader();

    const readLoop = async () => {
      try {
        while (this.collecting) {
          const { value: frame, done } = await reader.read();
          if (done || !frame) break;

          const frameBuffer = Buffer.from(
            frame.data.buffer,
            frame.data.byteOffset,
            frame.data.byteLength
          );
          // Resample from LiveKit rate → 24kHz for consumers
          const pcm24k = resample(frameBuffer, this.livekitSampleRate, 24000);
          this.emit("audio", pcm24k);
        }
      } catch {
        // Stream closed
      }
    };

    readLoop();
  }
}
