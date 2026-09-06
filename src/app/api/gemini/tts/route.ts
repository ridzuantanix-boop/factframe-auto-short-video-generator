import { getGeminiClient, GEMINI_TTS_MODEL } from "@/lib/gemini/client";
import { getVoicePreset } from "@/lib/audio/voicePresets";
import { createHash } from "node:crypto";
import { enforceRateLimit, rejectOversizedRequest } from "@/lib/server/rateLimit";
import { logFailure } from "@/lib/server/structuredLog";
import { ttsUnavailableResponse } from "@/lib/server/ttsAvailability";

const previewCache = new Map<string, { bytes: Buffer; type: string }>();
const speechCache = new Map<string, { bytes: Buffer; type: string }>();
const previewText = "Pada mulanya, ia nampak seperti kehilangan biasa. Tapi kemudian, satu petunjuk mengubah seluruh cerita.";

function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + pcm.length, 4); header.write("WAVE", 8); header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * 2, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, { name: "tts", limit: 6, windowMs: 10 * 60_000 });
  if (limited) return limited;
  const oversized = rejectOversizedRequest(request, 16_000); if (oversized) return oversized;
  const client = getGeminiClient();
  if (!client) return ttsUnavailableResponse();
  const body = await request.json() as { text?: string; tone?: "DOCUMENTARY" | "SUSPENSEFUL"; voicePresetId?: string; preview?: boolean };
  const text = body.preview ? previewText : body.text?.trim();
  if (!text || text.length > 6000) return Response.json({ error: "Teks narasi tidak sah." }, { status: 400 });
  const preset = getVoicePreset(body.voicePresetId);
  const cacheKey = body.preview ? `${preset.id}:${body.tone ?? "DOCUMENTARY"}` : createHash("sha256").update(`${text}|${preset.id}|${body.tone ?? "DOCUMENTARY"}`).digest("hex");
  const cache = body.preview ? previewCache : speechCache;
  const cached = cache.get(cacheKey);
  if (cached) return new Response(new Uint8Array(cached.bytes), { headers: { "Content-Type": cached.type, "X-Voice-Provider": "gemini", "X-Preview-Cache": "hit" } });
  const direction = body.tone === "SUSPENSEFUL"
    ? "Perform with restrained suspense, varied pacing and brief natural pauses. Build curiosity without sounding theatrical."
    : "Perform like a warm Malaysian investigative documentary narrator. Calm, intimate and confident, with natural conversational rhythm.";
  const prompt = `Synthesize speech only. Read the transcript exactly. Never summarize, rewrite, add or remove words. Do not read these instructions aloud.\n\nLANGUAGE: Natural Malaysian Malay. Avoid Indonesian or English-style pronunciation for ordinary Malay words.\nAUDIO PROFILE: A real-sounding adult Malaysian documentary narrator.\nVOICE STYLE: ${preset.stylePrompt}\nSTORY TONE: ${direction}\nDIRECTOR'S NOTES: Avoid announcer voice, robotic cadence and identical emphasis on every sentence. Articulate names, dates and Malaysian place names clearly.\n\nTRANSCRIPT:\n${text}`;
  try {
    if (process.env.NODE_ENV === "development") console.info(`[Gemini TTS] request preset=${preset.id} preview=${Boolean(body.preview)}`);
    const response = await client.interactions.create({ model: GEMINI_TTS_MODEL, input: prompt, response_format: { type: "audio" }, generation_config: { speech_config: [{ voice: preset.geminiVoice }] } });
    const audio = response.output_audio;
    if (!audio?.data) throw new Error("Gemini tidak memulangkan audio.");
    const bytes = Buffer.from(audio.data, "base64");
    if (audio.mime_type?.startsWith("audio/l16") || !audio.mime_type) {
      const wav = pcmToWav(bytes, audio.sample_rate ?? 24_000, audio.channels ?? 1);
      cache.set(cacheKey, { bytes: wav, type: "audio/wav" }); if (cache.size > 50) cache.delete(cache.keys().next().value!);
      return new Response(new Uint8Array(wav), { headers: { "Content-Type": "audio/wav", "X-Voice-Provider": "gemini", "X-Preview-Cache": "miss" } });
    }
    cache.set(cacheKey, { bytes, type: audio.mime_type }); if (cache.size > 50) cache.delete(cache.keys().next().value!);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": audio.mime_type, "X-Voice-Provider": "gemini", "X-Preview-Cache": "miss" } });
  } catch (error) {
    logFailure("tts.failure", error);
    return Response.json({ error: "Suara belum dapat disediakan. Sila cuba semula." }, { status: 502 });
  }
}
