# Audio Emotion / Sentiment Analysis Research

**Date**: 2026-02-24
**Scope**: Concern 2 -- emotion/sentiment from audio prosody (pitch, tone, rhythm, stress)
**NOT in scope**: VAD/speech activity analysis (Concern 1)

---

## Executive Summary

There are fundamentally **three tiers** of audio emotion analysis:

| Tier | Approach | Example | Audio Prosody? | Cost/min |
|------|----------|---------|----------------|----------|
| **1. Purpose-built emotion API** | Dedicated model trained on prosody/vocal features | **Hume AI** | Yes -- native | ~$0.064/min |
| **2. Multimodal LLM** | General LLM that accepts audio natively | **GPT-4o Audio**, **Gemini** | Partial -- inferred | $0.02-$1.55/min |
| **3. Transcript-based sentiment** | STT then NLP on text | **AssemblyAI**, **Deepgram**, **AWS Transcribe** | No -- text only | $0.002-$0.01/min |
| **4. Open source** | Self-hosted models | **SpeechBrain**, **openSMILE** | Yes -- native | Free (compute only) |

**Key finding**: Only Hume AI and open-source models (SpeechBrain, openSMILE) actually analyze audio prosody directly. AssemblyAI, Deepgram, and AWS Transcribe do sentiment analysis on *transcribed text*, not on acoustic features. Multimodal LLMs (GPT-4o, Gemini) sit in between -- they receive audio natively and can reason about tone, but their emotion detection is not purpose-built and lacks structured prosody dimensions.

---

## 1. Hume AI Expression Measurement API

### Overview
Hume AI is the **only dedicated, production-ready API** specifically built for measuring emotion from audio prosody. Built on over a decade of computational emotion science research. Backed by $50M+ in funding.

### How It Works
- **Speech Prosody Model**: Measures the non-linguistic tune, rhythm, and timbre of speech
- **Vocal Burst Model**: Analyzes laughs, sighs, hmms, cries, shrieks
- **Emotional Language Model**: Analyzes the semantic content of transcribed speech
- All three can run together on a single audio input

### What It Returns: The 48 Prosody Dimensions
Each dimension gets a score from 0.0 to 1.0 indicating the likelihood a human perceiver would identify that expression:

```
Admiration, Adoration, Aesthetic Appreciation, Amusement, Anger,
Annoyance, Anxiety, Awe, Awkwardness, Boredom,
Calmness, Concentration, Confusion, Contemplation, Contempt,
Contentment, Craving, Desire, Determination, Disappointment,
Disapproval, Disgust, Distress, Doubt, Ecstasy,
Embarrassment, Empathic Pain, Enthusiasm, Entrancement, Envy,
Excitement, Fear, Gratitude, Guilt, Horror,
Interest, Joy, Love, Nostalgia, Pain,
Pride, Realization, Relief, Romance, Sadness,
Satisfaction, Shame, Surprise (positive), Surprise (negative),
Sympathy, Tiredness, Triumph
```

(Note: The exact count varies between 48-53 across models; the prosody model specifically outputs 48 dimensions.)

### API Response Format (JSON)
```json
{
  "source": { "type": "url", "url": "https://..." },
  "results": {
    "predictions": [{
      "file": "audio.wav",
      "models": {
        "prosody": {
          "grouped_predictions": [{
            "id": "speaker_0",
            "predictions": [{
              "text": "I'm really frustrated with this",
              "time": { "begin": 0.0, "end": 2.5 },
              "emotions": [
                { "name": "Frustration", "score": 0.82 },
                { "name": "Anger", "score": 0.45 },
                { "name": "Disappointment", "score": 0.38 },
                ...  // all 48 dimensions
              ]
            }]
          }]
        }
      }
    }]
  }
}
```

### Two API Modes

**Batch REST API** (POST job, poll for results):
- Submit files or URLs, retrieve predictions when complete
- Supports `word`, `sentence`, `utterance`, and `conversational_turn` granularity
- Max file: 100 MB local upload, 1 GB remote URL
- Max duration: 3 hours per file
- Max 100 items per request
- Rate limit: 50 requests/minute

**Streaming WebSocket API** (real-time):
- Persistent connection, send audio chunks continuously
- Max payload: 5 seconds of audio per message
- WebSocket timeout: 1 minute of inactivity
- Rate limit: 50 WebSocket handshakes/second
- Near real-time feedback on prosody dimensions

### Audio Format Support
- WAV, MP3, AIF accepted (confirmed in documentation)
- Raw PCM: Not explicitly documented, but WAV (which wraps PCM) is supported. You would need to wrap PCM in a WAV header or convert.
- The streaming WebSocket accepts audio chunks, suggesting flexible format support

### Pricing
| Type | Cost |
|------|------|
| Audio only (prosody + vocal burst + emotional language + transcription) | **$0.0639/min** |
| Video with audio | $0.0828/min |
| Images | $0.00204/image |
| Text only | $0.00024/word |
| Enterprise | Volume discounts (custom) |

**No free tier** for Expression Measurement.

**Cost for VoiceCI**: A 5-minute call = ~$0.32. At 10,000 calls/month = ~$3,200/month.

### Latency
- **Batch API**: Asynchronous -- submit and poll. Latency depends on queue and file size. Not suitable for real-time per-turn analysis.
- **WebSocket streaming**: Near real-time. Can process 5-second audio chunks with immediate response. **Suitable for per-turn analysis** if you buffer each turn and send it.
- SDK default request timeout: 60 seconds

### Quality / Accuracy
- Built on peer-reviewed research (Nature Human Behavior publications)
- 48 dimensions grounded in cross-cultural emotion studies
- The most granular emotion output of any commercial API
- Reputation: Industry leader for prosody-based emotion measurement
- Limitation: Labels are "what a human perceiver would identify" -- not necessarily what the speaker is feeling

### VoiceCI Fit Assessment
- **Per-turn analysis**: YES via WebSocket streaming (send each turn as a chunk)
- **PCM audio**: Needs WAV header wrapping (trivial -- 44 bytes)
- **Granularity**: Excellent -- 48 dimensions per utterance/turn
- **Sentiment trajectory**: Can track emotion scores across turns to build trajectory
- **Main concern**: Cost at scale; $0.064/min adds up

---

## 2. Multimodal LLMs (GPT-4o Audio, Gemini)

### 2a. GPT-4o Audio Preview

**How it works**: GPT-4o natively processes audio input (not just transcription). The model receives the raw audio waveform and can reason about both content and acoustic features like tone, pitch, pace, and emotional quality.

**API**: Chat Completions endpoint (`/v1/chat/completions`)
```json
{
  "model": "gpt-4o-audio-preview",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": "Analyze the emotion and sentiment in this audio" },
      {
        "type": "input_audio",
        "input_audio": {
          "data": "<base64_encoded_audio>",
          "format": "wav"
        }
      }
    ]
  }]
}
```

**What it returns**: Free-form text analysis. You prompt it to analyze emotion and it returns natural language description. No structured 48-dimension output -- you'd need to prompt-engineer structured JSON output.

**Audio format**: WAV, base64-encoded. Input supports audio/* MIME types.

**Pricing (gpt-4o-audio-preview)**:
| Type | Per 1M tokens | Per minute estimate |
|------|---------------|---------------------|
| Audio input | $40.00 | ~$1.55/hour = ~$0.026/min |
| Audio output | $80.00 | ~$5.93/hour |
| Text output | $10.00 | N/A |

For analysis only (audio in, text out), the cost is approximately **$0.026/min** for input audio + text output tokens.

**gpt-4o-mini-audio-preview** (cheaper):
| Type | Per 1M tokens |
|------|---------------|
| Audio input | $10.00 |
| Audio output | $20.00 |

Approximately **$0.007/min** for input audio -- significantly cheaper.

**Latency**: Standard LLM inference latency (2-10 seconds). Can work per-turn.

**Quality for emotion**:
- Research shows GPT-4o is "comparable to other language models" for emotion recognition, outperforming Whisper-LLaMA
- Good at detecting accent, prosody, fluency, pronunciation, stress
- Detects emotions through volume, pace, pitch variations, pause patterns
- However: It's a **general-purpose model**, not purpose-built for emotion
- No structured prosody dimensions -- you get whatever the model decides to say
- Results are non-deterministic and can vary between runs

### 2b. Gemini (2.0 Flash / 2.5 Flash)

**How it works**: Gemini natively ingests audio and can analyze emotional content. Google has published example notebooks for multimodal sentiment analysis comparing direct audio analysis vs. transcript-based analysis.

**API**: Standard Gemini API with audio input
```python
model = genai.GenerativeModel("gemini-2.0-flash")
response = model.generate_content([
    audio_file,  # uploaded audio
    "Analyze the emotion and sentiment in this audio clip"
])
```

**Audio tokenization**: Fixed rate of **32 tokens per second** of audio (1 minute = 1,920 tokens)

**Pricing**:
| Model | Audio input / 1M tokens | Per minute |
|-------|-------------------------|------------|
| Gemini 2.0 Flash | $0.70 | **$0.0013/min** |
| Gemini 2.5 Flash | $1.00 | **$0.0019/min** |
| Gemini 2.5 Flash-Lite | $0.30 | **$0.0006/min** |

Plus text output tokens for the analysis response (minimal cost).

**This makes Gemini dramatically cheaper than all other options.**

**Quality for emotion**:
- Can detect speech, emotion, and intent in voice
- Recognizes laughter, tone of voice, speaking style
- Distinguishes between sarcasm and sincerity via vocal inflection
- Multimodal analysis captures nuances like tone and inflection beyond text
- However: Same limitation as GPT-4o -- general-purpose, not purpose-built
- Returns free-form text, not structured prosody dimensions

**Latency**: Standard LLM inference (1-5 seconds for Flash models). Fast enough for per-turn.

### Multimodal LLM Assessment for VoiceCI

**Strengths**:
- Can analyze both content AND tone simultaneously
- Flexible -- you can prompt for exactly what you want
- Can output structured JSON if prompted carefully
- Gemini is extremely cheap
- GPT-4o has strong prosody detection research backing

**Weaknesses**:
- Not purpose-built for emotion -- less accurate than dedicated models
- No standardized emotion dimensions -- you must design your own schema
- Non-deterministic outputs -- same audio may get different scores
- No confidence scores on emotion dimensions
- Academic research on accuracy is still emerging

**Practical approach**: Prompt the model with a structured schema:
```
Analyze this audio for caller emotion. Return JSON:
{
  "frustration": 0-1,
  "anger": 0-1,
  "satisfaction": 0-1,
  "confusion": 0-1,
  "enthusiasm": 0-1,
  "overall_sentiment": -1 to 1,
  "confidence": 0-1,
  "notes": "free text"
}
```

---

## 3. Transcript-Based Sentiment APIs

**CRITICAL NOTE**: These services do NOT analyze audio prosody. They transcribe speech to text, then run NLP sentiment analysis on the transcript. A frustrated speaker saying "That's fine" in an angry tone would likely be scored as neutral/positive because the text is neutral.

### 3a. AssemblyAI

**How it works**: Transcribes audio via speech-to-text, then runs transformer-based sentiment analysis on the transcribed text. Confirmed transcript-based, NOT audio prosody.

**Output**: Per-sentence sentiment: `POSITIVE`, `NEGATIVE`, or `NEUTRAL` with confidence score.

**Pricing**:
- Base transcription: $0.15/hour ($0.0025/min)
- Sentiment analysis add-on: $0.02/hour ($0.0003/min)
- **Total: ~$0.003/min**

**Limitations**:
- English only for sentiment analysis
- Text-based only -- misses tone, sarcasm, prosody
- 3 sentiment classes only (no granular emotions)

### 3b. Deepgram

**How it works**: Transcription via Nova-3, then token-based audio intelligence models for sentiment.

**Output**: Sentiment score from -1.0 to +1.0 for every word, sentence, utterance, and paragraph.

**Pricing**:
- Transcription: $0.0077/min (Pay-As-You-Go)
- Sentiment analysis: $0.0003/1k input tokens + $0.0006/1k output tokens
- **Total: ~$0.008-0.01/min**

**Strengths**:
- Granular per-word sentiment scores
- Continuous -1 to +1 scale (not just 3 classes)
- Fast -- designed for real-time use
- $200 free credits for new accounts

**Limitations**:
- English only for sentiment
- Still transcript-based -- no prosody analysis

### 3c. Amazon Transcribe Call Analytics

**How it works**: Transcription + call analytics including sentiment, interruptions, non-talk time, talk speed.

**Output**:
- Sentiment per turn: POSITIVE, NEGATIVE, NEUTRAL, MIXED with score (-5 to +5)
- Separate customer and agent sentiment tracking
- Call characteristics: non-talk time, interruptions, loudness, talk speed

**Pricing**:
- Post-call analytics: $0.0075/min
- Real-time analytics: $0.01125/min
- Generative summarization: additional tiered pricing

**Strengths**:
- Includes some acoustic features: loudness and talk speed
- Built-in agent vs. customer separation
- Call categorization with custom rules
- PII redaction included

**Limitations**:
- Primarily transcript-based sentiment
- Basic emotion model (pos/neg/neutral/mixed)
- AWS ecosystem lock-in
- Sentiment analysis is not customizable

---

## 4. Open Source Options

### 4a. SpeechBrain (emotion-recognition-wav2vec2-IEMOCAP)

**What it is**: PyTorch-based speech toolkit with pretrained emotion recognition models.

**Architecture**: wav2vec2 encoder + attentive statistical pooling + classifier

**Output**: 4 emotion classes: `angry`, `happy`, `neutral`, `sad`
- Accuracy: **78.7%** on IEMOCAP test set (75.3% average across classes)
- Input: 16kHz single-channel WAV/PCM

**Pros**:
- Free / open source
- Runs locally -- no API costs, no data leaving your infrastructure
- Fast inference -- can process per-turn in real-time
- Well-established in academic research
- Can be fine-tuned on your own data

**Cons**:
- Only 4 emotion classes (vs. Hume's 48)
- 78.7% accuracy -- not production-grade without fine-tuning
- Requires Python + PyTorch runtime
- IEMOCAP dataset is acted speech -- may not generalize to real calls
- You own the model maintenance burden

**VoiceCI Fit**: Good for a quick, free baseline. Limited granularity. Would need to run as a Python sidecar service.

### 4b. openSMILE

**What it is**: C++ toolkit for audio feature extraction (not classification). Extracts acoustic features that can be fed into a classifier.

**Output**: Feature vectors (not emotion labels). Standard feature sets include:
- IS10 (INTERSPEECH 2010 Emotion Challenge features)
- eGeMAPS (extended Geneva Minimalistic Acoustic Parameter Set)
- Features: pitch (F0), loudness, spectral features, MFCCs, jitter, shimmer, HNR, formants, speaking rate

**Pros**:
- Free / open source
- Very fast (C++)
- Python bindings available (opensmile-python)
- Cross-platform (Linux, macOS, Windows, mobile, embedded)
- Extracts raw acoustic features -- can feed into any ML model
- Well-established standard in affective computing research

**Cons**:
- Feature extraction only -- you need to build/train a classifier on top
- Significant ML expertise required
- No emotion labels out of the box
- Feature engineering approach (vs. end-to-end deep learning)

**VoiceCI Fit**: Best used as a feature extractor feeding into a custom model. Not a drop-in solution. Could extract pitch trajectory, loudness, speaking rate per turn -- useful for building a custom "frustration score" even without classification.

### 4c. pyAudioAnalysis

**What it is**: Python library for audio analysis including feature extraction, classification, and segmentation.

**Output**: Can classify into emotional categories if trained. Ships with some pretrained models.

**Pros**: Easy Python API, includes segmentation
**Cons**: Less maintained than SpeechBrain, lower accuracy, smaller community

---

## 5. Comparison Matrix

| Feature | Hume AI | GPT-4o Audio | Gemini Flash | AssemblyAI | Deepgram | AWS Transcribe | SpeechBrain | openSMILE |
|---------|---------|-------------|--------------|------------|----------|----------------|-------------|-----------|
| **Analyzes actual audio prosody** | YES | Partial | Partial | NO | NO | Partial* | YES | YES (features) |
| **Emotion dimensions** | 48 | Free-form | Free-form | 3 (pos/neg/neutral) | -1 to +1 | 4 (pos/neg/neutral/mixed) | 4 classes | Raw features |
| **Per-turn analysis** | YES (WebSocket) | YES | YES | YES (post-hoc) | YES | YES (streaming) | YES | YES |
| **Structured output** | YES (JSON, 48 dims) | Prompt-dependent | Prompt-dependent | YES | YES | YES | YES | YES (features) |
| **Cost/min** | $0.064 | ~$0.026 | **$0.001** | $0.003 | $0.008 | $0.011 | Free | Free |
| **Latency** | <1s (WS), async (batch) | 2-10s | 1-5s | Async | <1s | <1s (streaming) | <100ms | <50ms |
| **Audio format** | WAV/MP3/AIF | WAV (base64) | Any audio | WAV/MP3/etc | WAV/MP3/etc | WAV/FLAC/etc | 16kHz WAV | WAV/any |
| **PCM compatible** | Needs WAV header | Needs WAV header | Needs format | Needs format | Needs format | Needs format | Yes (16kHz) | Yes |
| **Accuracy (emotion)** | Best-in-class | Good (general) | Good (general) | N/A (text) | N/A (text) | N/A (text) | 78.7% | N/A (features) |
| **Language support** | Multi-language | Multi-language | Multi-language | English only | English only | Multi-language | English (IEMOCAP) | Any |

*AWS Transcribe captures loudness and talk speed as acoustic features but sentiment is transcript-based.

---

## 6. Recommendations for VoiceCI

### Recommended: Tiered Approach

**Tier 1 -- Always run (cheap baseline)**:
Use **Gemini 2.5 Flash** for every call turn. At $0.001/min, it's nearly free. Send each audio turn with a structured prompt asking for frustration, satisfaction, anger, confusion scores. This gives you a good-enough sentiment trajectory at negligible cost.

**Tier 2 -- High-value analysis**:
Use **Hume AI WebSocket API** for calls where you need detailed prosody analysis (e.g., QA flagged calls, escalated calls, or a sample for calibration). The 48-dimension output is unmatched. At $0.064/min, use it selectively.

**Tier 3 -- Free acoustic features**:
Use **openSMILE** to extract pitch trajectory, loudness, and speaking rate per turn. These raw features are free to compute and can detect rising pitch (frustration), increased loudness (anger), or slowed speech (resignation) without any API call. Can run as a lightweight Node.js/Python sidecar.

### Cost Projection (10,000 calls/month, avg 5 min each)

| Approach | Monthly cost |
|----------|-------------|
| Gemini 2.5 Flash only | ~$50 |
| GPT-4o-mini-audio only | ~$350 |
| Hume AI only | ~$3,200 |
| GPT-4o-audio only | ~$1,300 |
| Gemini + Hume (10% sample) | ~$370 |
| Gemini + openSMILE | ~$50 + compute |

### Implementation Priority

1. **Start with Gemini 2.0/2.5 Flash** -- cheapest, easiest to integrate, good enough for most sentiment tracking
2. **Add openSMILE pitch/loudness extraction** -- free, runs locally, gives you raw acoustic features that don't depend on LLM interpretation
3. **Evaluate Hume AI** -- if Gemini's emotion detection proves too coarse or unreliable, Hume is the gold standard for structured prosody-based emotion
4. **Skip transcript-based options** (AssemblyAI, Deepgram sentiment) -- they don't solve the prosody problem and VoiceCI already has transcription

---

## 7. Key Technical Notes for VoiceCI Integration

### PCM Audio Handling
VoiceCI has raw PCM audio per turn. For any of these APIs:
- **Hume / GPT-4o / Gemini**: Wrap PCM in a WAV header (44 bytes, trivial operation)
- **SpeechBrain**: Accepts raw 16kHz mono PCM directly
- **openSMILE**: Can read WAV files

### Per-Turn vs. Whole-Call
- **Per-turn** (recommended): Send each conversational turn individually. Tracks emotion trajectory.
- **Whole-call** (alternative): Send the entire call recording. Gets aggregate sentiment but loses turn-by-turn granularity.

### Sentiment Trajectory
For tracking how emotion evolves across a call:
1. Process each turn with the chosen model
2. Store per-turn scores (timestamp, speaker, emotion scores)
3. Plot/aggregate into a sentiment trajectory curve
4. Flag calls where frustration increases over time or spikes suddenly

---

## Sources

- [Hume AI Expression Measurement API](https://dev.hume.ai/docs/expression-measurement/overview)
- [Hume AI Pricing](https://www.hume.ai/pricing)
- [Hume AI Emotional Speech Model](https://www.hume.ai/products/prosody)
- [Hume AI Expression Measurement FAQ](https://dev.hume.ai/docs/expression-measurement/faq)
- [Hume AI Batch API Reference](https://dev.hume.ai/reference/expression-measurement-api/batch/get-job-predictions)
- [GPT-4o Audio Model](https://developers.openai.com/api/docs/models/gpt-4o-audio-preview)
- [OpenAI API Pricing](https://developers.openai.com/api/docs/pricing)
- [OpenAI Audio and Speech Guide](https://developers.openai.com/api/docs/guides/audio/)
- [Azure OpenAI GPT-4o Audio Cost Analysis](https://clemenssiebler.com/posts/azure-openai-gpt4o-audio-api-cost-analysis/)
- [Gemini API Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini Audio Understanding](https://ai.google.dev/gemini-api/docs/audio)
- [Gemini Multimodal Sentiment Analysis Notebook](https://github.com/GoogleCloudPlatform/generative-ai/blob/main/gemini/use-cases/multimodal-sentiment-analysis/intro_to_multimodal_sentiment_analysis.ipynb)
- [AssemblyAI Sentiment Analysis Docs](https://www.assemblyai.com/docs/audio-intelligence/sentiment-analysis)
- [Deepgram Pricing](https://deepgram.com/pricing)
- [Deepgram Audio Intelligence](https://deepgram.com/learn/ai-speech-audio-intelligence-sentiment-analysis-intent-recognition-topic-detection-api)
- [Amazon Transcribe Call Analytics](https://aws.amazon.com/transcribe/call-analytics/)
- [Amazon Transcribe Pricing](https://aws.amazon.com/transcribe/pricing/)
- [SpeechBrain emotion-recognition-wav2vec2-IEMOCAP](https://huggingface.co/speechbrain/emotion-recognition-wav2vec2-IEMOCAP)
- [openSMILE Documentation](https://audeering.github.io/opensmile/)
- [Top 7 Methods for Audio Sentiment Analysis](https://research.aimultiple.com/audio-sentiment-analysis/)
- [GPT-4o Voice Mode Exploration (arXiv)](https://arxiv.org/html/2502.09940v1)
