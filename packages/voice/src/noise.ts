/**
 * Noise generation and audio mixing utilities for audio tests.
 * All audio is 16-bit signed PCM, 24kHz mono.
 */

const SAMPLE_RATE = 24000;
const MAX_SAMPLE = 32767;
const MIN_SAMPLE = -32768;

function clamp(value: number): number {
  return Math.max(MIN_SAMPLE, Math.min(MAX_SAMPLE, Math.round(value)));
}

/**
 * Generate white noise (uniform random across all frequencies).
 * Tests broadband interference — construction, static, etc.
 */
export function generateWhiteNoise(durationMs: number, rmsLevel = 3000): Buffer {
  const numSamples = Math.floor((SAMPLE_RATE * durationMs) / 1000);
  const buf = Buffer.alloc(numSamples * 2);

  for (let i = 0; i < numSamples; i++) {
    const sample = clamp((Math.random() * 2 - 1) * rmsLevel * Math.SQRT2);
    buf.writeInt16LE(sample, i * 2);
  }

  return buf;
}

/**
 * Generate babble noise (low-pass filtered white noise with speech-like spectrum).
 * Simulates crowded environments — restaurant, office, etc.
 * Uses a 6-sample moving average for ~4kHz cutoff at 24kHz sample rate.
 */
export function generateBabbleNoise(durationMs: number, rmsLevel = 3000): Buffer {
  const numSamples = Math.floor((SAMPLE_RATE * durationMs) / 1000);
  const buf = Buffer.alloc(numSamples * 2);

  // Generate white noise first
  const raw = new Float64Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    raw[i] = (Math.random() * 2 - 1);
  }

  // Moving average low-pass filter (window = 6 → ~4kHz cutoff)
  const windowSize = 6;
  const filtered = new Float64Array(numSamples);
  let runningSum = 0;

  for (let i = 0; i < numSamples; i++) {
    runningSum += raw[i]!;
    if (i >= windowSize) runningSum -= raw[i - windowSize]!;
    const count = Math.min(i + 1, windowSize);
    filtered[i] = runningSum / count;
  }

  // Normalize to target RMS
  let sumSq = 0;
  for (let i = 0; i < numSamples; i++) sumSq += filtered[i]! * filtered[i]!;
  const currentRms = Math.sqrt(sumSq / numSamples);
  const scale = currentRms > 0 ? rmsLevel / currentRms : 0;

  for (let i = 0; i < numSamples; i++) {
    buf.writeInt16LE(clamp(filtered[i]! * scale), i * 2);
  }

  return buf;
}

/**
 * Generate pink noise (1/f spectral density) using the Voss-McCartney algorithm.
 * Models real-world ambient noise — HVAC, traffic hum, crowd rumble.
 */
export function generatePinkNoise(durationMs: number, rmsLevel = 3000): Buffer {
  const numSamples = Math.floor((SAMPLE_RATE * durationMs) / 1000);
  const buf = Buffer.alloc(numSamples * 2);
  const octaves = 8;

  // Voss-McCartney: maintain running values per octave
  const octaveValues = new Float64Array(octaves);
  for (let j = 0; j < octaves; j++) {
    octaveValues[j] = Math.random() * 2 - 1;
  }

  const raw = new Float64Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    // Update octaves based on trailing zeros of sample index
    let idx = i;
    for (let j = 0; j < octaves && (idx & 1) === 0; j++) {
      octaveValues[j] = Math.random() * 2 - 1;
      idx >>= 1;
    }

    // Sum octaves + white noise term
    let sum = Math.random() * 2 - 1; // white noise term
    for (let j = 0; j < octaves; j++) sum += octaveValues[j]!;
    raw[i] = sum / (octaves + 1);
  }

  // Normalize to target RMS
  let sumSq = 0;
  for (let i = 0; i < numSamples; i++) sumSq += raw[i]! * raw[i]!;
  const currentRms = Math.sqrt(sumSq / numSamples);
  const scale = currentRms > 0 ? rmsLevel / currentRms : 0;

  for (let i = 0; i < numSamples; i++) {
    buf.writeInt16LE(clamp(raw[i]! * scale), i * 2);
  }

  return buf;
}

/**
 * Mix clean audio with noise at a specified SNR (signal-to-noise ratio in dB).
 *
 * SNR 20dB = mild noise (quiet office)
 * SNR 10dB = moderate noise (busy street)
 * SNR 5dB  = severe noise (loud restaurant)
 */
export function mixAudio(clean: Buffer, noise: Buffer, snrDb: number): Buffer {
  if (clean.length === 0) return Buffer.alloc(0);

  const numSamples = clean.length / 2;
  const mixed = Buffer.alloc(clean.length);

  // Compute RMS of clean signal
  let cleanSumSq = 0;
  for (let i = 0; i < numSamples; i++) {
    const s = clean.readInt16LE(i * 2);
    cleanSumSq += s * s;
  }
  const cleanRms = Math.sqrt(cleanSumSq / numSamples);

  // Compute RMS of noise (looping if shorter than clean)
  const noiseSamples = noise.length / 2;
  let noiseSumSq = 0;
  for (let i = 0; i < noiseSamples; i++) {
    const s = noise.readInt16LE(i * 2);
    noiseSumSq += s * s;
  }
  const noiseRms = Math.sqrt(noiseSumSq / noiseSamples);

  if (noiseRms === 0) {
    clean.copy(mixed);
    return mixed;
  }

  // Scale factor: desired_noise_rms = cleanRms / 10^(snrDb/20)
  const scaleFactor = cleanRms / (noiseRms * Math.pow(10, snrDb / 20));

  for (let i = 0; i < numSamples; i++) {
    const cleanSample = clean.readInt16LE(i * 2);
    const noiseIdx = i % noiseSamples;
    const noiseSample = noise.readInt16LE(noiseIdx * 2);
    mixed.writeInt16LE(clamp(cleanSample + noiseSample * scaleFactor), i * 2);
  }

  return mixed;
}
