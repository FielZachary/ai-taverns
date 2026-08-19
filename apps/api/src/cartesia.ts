import { randomUUID } from "node:crypto";
import WebSocket from "ws";

const cartesiaVersion = "2026-03-01";
const griffinVoiceId = "34d923aa-c3b5-4f21-aac7-2c1f12730d4b";
const sampleRate = 44_100;

export type CartesiaWordTiming = { word: string; start: number; end: number };

function plainText(value: string) {
  return value.replace(/<\/?(?:npc|place|clue|danger|faction|object|em)>/g, "").replace(/\s+/g, " ").trim();
}

export async function streamCartesiaNarration(input: {
  apiKey: string;
  narration: string;
  onAudio: (audio: string, wordTimings: CartesiaWordTiming[]) => void;
}) {
  const transcript = plainText(input.narration);
  if (!transcript) throw new Error("Narration is empty.");
  const contextId = randomUUID();
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(`wss://api.cartesia.ai/tts/websocket?cartesia_version=${cartesiaVersion}`, {
      headers: { Authorization: `Bearer ${input.apiKey}`, "Cartesia-Version": cartesiaVersion }
    });
    socket.once("error", reject);
    socket.once("open", () => socket.send(JSON.stringify({
      model_id: "sonic-3.5-2026-05-04", transcript, context_id: contextId,
      voice: { mode: "id", id: griffinVoiceId }, language: "en",
      output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: sampleRate },
      add_timestamps: true, continue: false
    })));
    socket.on("message", (raw) => {
      const event = JSON.parse(raw.toString()) as Record<string, unknown>;
      if (event.type === "chunk" && typeof event.data === "string") {
        const timestamps = Array.isArray(event.word_timestamps) ? event.word_timestamps : [];
        input.onAudio(event.data, timestamps.map((item) => ({ word: String((item as Record<string, unknown>).word ?? ""), start: Number((item as Record<string, unknown>).start ?? 0), end: Number((item as Record<string, unknown>).end ?? 0) })));
      }
      if (event.done || event.type === "done") { socket.close(); resolve(); }
      if (event.type === "error") { socket.close(); reject(new Error(String(event.message ?? "Cartesia TTS failed."))); }
    });
  });
}

export { plainText, sampleRate };
