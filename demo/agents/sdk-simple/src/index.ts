/**
 * sdk-simple — Simplest possible VoiceCI SDK agent.
 *
 * Echoes audio back with a short delay. No external API keys needed.
 * Demonstrates the minimal SDK integration pattern.
 *
 * This is the "hello world" of VoiceCI SDK agents.
 */

import { VoiceCIServer } from "@voiceci/sdk";

const server = new VoiceCIServer({
  port: Number(process.env.PORT) || 3001,

  onAudio: async (audio, { reportToolCall }) => {
    // Simulate a tool call for testing purposes
    reportToolCall({
      name: "echo",
      arguments: { bytes: audio.length },
      result: { echoed: true },
      successful: true,
      duration_ms: 1,
    });

    // Echo the audio back — VoiceCI's runner will transcribe it
    // and evaluate the conversation based on the test spec
    return { audio };
  },
});

await server.start();
