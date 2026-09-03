import { DEFAULT_VOICE_PRESET_ID, type VoicePresetId } from "@/lib/audio/voicePresets";

export type TTSProgress = (message: string, percent?: number) => void;
export type TTSOptions = { tone?: "DOCUMENTARY" | "SUSPENSEFUL"; voicePresetId?: VoicePresetId; targetDurationSeconds?: 30 | 60 | 90; preview?: boolean };
export type GeneratedSpeech = { audioBlob: Blob; mimeType: string; durationSeconds: number; voicePresetId: VoicePresetId; provider: "gemini" | "local" };

export interface TTSProvider {
  generateSpeech(text: string, language: string, onProgress?: TTSProgress, options?: TTSOptions): Promise<GeneratedSpeech>;
}

const finalAudioCache = new Map<string, Promise<GeneratedSpeech>>();
const previewAudioCache = new Map<string, Promise<GeneratedSpeech>>();

async function validateAudio(audioBlob: Blob) {
  if (!audioBlob.size) throw new Error("Fail suara kosong.");
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await audioBlob.arrayBuffer());
    if (!Number.isFinite(buffer.duration) || buffer.duration <= .5) throw new Error("Tempoh suara tidak sah.");
    return buffer.duration;
  } finally { await context.close(); }
}

class MalayNeuralBrowserTTS implements TTSProvider {
  async generateSpeech(text: string, language: string, onProgress?: TTSProgress, options: TTSOptions = {}) {
    if (!language.startsWith("ms")) throw new Error("Narasi tempatan V1 kini menyokong Bahasa Melayu.");
    onProgress?.("Memuatkan suara neural Bahasa Melayu", 5);
    const worker = new Worker(new URL("./tts.worker.ts", import.meta.url), { type: "module" });
    const audioBlob = await new Promise<Blob>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<{ type: string; message?: string; percent?: number; wav?: ArrayBuffer; error?: string }>) => {
        if (event.data.type === "progress") onProgress?.(event.data.message ?? "Menghasilkan narasi", event.data.percent);
        if (event.data.type === "done" && event.data.wav) { worker.terminate(); resolve(new Blob([event.data.wav], { type: "audio/wav" })); }
        if (event.data.type === "error") { worker.terminate(); reject(new Error(event.data.error ?? "Suara tempatan tidak dapat dihasilkan.")); }
      };
      worker.onerror = () => { worker.terminate(); reject(new Error("Enjin suara tempatan gagal berfungsi.")); };
      worker.postMessage({ text });
    });
    const durationSeconds = await validateAudio(audioBlob);
    onProgress?.("Narasi siap", 100);
    return { audioBlob, mimeType: audioBlob.type, durationSeconds, voicePresetId: options.voicePresetId ?? DEFAULT_VOICE_PRESET_ID, provider: "local" as const };
  }
}

class GeminiHumanTTS implements TTSProvider {
  async generateSpeech(text: string, language: string, onProgress?: TTSProgress, options: TTSOptions = {}) {
    if (!language.startsWith("ms")) throw new Error("Narasi V1.2 kini menyokong Bahasa Melayu.");
    const voicePresetId = options.voicePresetId ?? DEFAULT_VOICE_PRESET_ID;
    const cache = options.preview ? previewAudioCache : finalAudioCache;
    const cacheKey = `${text}|${voicePresetId}|${options.tone ?? "DOCUMENTARY"}`;
    const existing = cache.get(cacheKey);
    if (existing) { onProgress?.("Menggunakan semula suara tersimpan", 100); return existing; }
    const job = (async () => {
      let lastError: Error | undefined;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          onProgress?.(options.preview ? "Menyediakan pratonton suara" : `Gemini mempersembahkan narasi · cubaan ${attempt}/2`, 24);
          const response = await fetch("/api/gemini/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, tone: options.tone, voicePresetId, preview: options.preview }) });
          if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error ?? "Penjanaan suara gagal."); }
          const audioBlob = await response.blob();
          const durationSeconds = await validateAudio(audioBlob);
          const target = options.targetDurationSeconds;
          if (!options.preview && target) {
            const range = target === 30 ? [25, 35] : target === 60 ? [50, 70] : [75, 100];
            if (durationSeconds < range[0] * .75 || durationSeconds > range[1] * 1.25) throw new Error(`Tempoh suara ${Math.round(durationSeconds)} saat terlalu jauh daripada sasaran ${target} saat.`);
          }
          onProgress?.("Suara Gemini siap", 100);
          return { audioBlob, mimeType: audioBlob.type, durationSeconds, voicePresetId, provider: "gemini" as const };
        } catch (error) { lastError = error instanceof Error ? error : new Error("Penjanaan suara gagal."); }
      }
      throw lastError ?? new Error("Penjanaan suara gagal selepas dua cubaan.");
    })();
    cache.set(cacheKey, job);
    try { return await job; } catch (error) { cache.delete(cacheKey); throw error; }
  }
}

class AdaptiveTTS implements TTSProvider {
  private readonly local = new MalayNeuralBrowserTTS();
  private readonly gemini = new GeminiHumanTTS();
  async generateSpeech(text: string, language: string, onProgress?: TTSProgress, options: TTSOptions = {}) {
    const status = await fetch("/api/gemini/status").then((response) => response.json()).catch(() => ({ configured: false }));
    return status.configured ? this.gemini.generateSpeech(text, language, onProgress, options) : this.local.generateSpeech(text, language, onProgress, options);
  }
}

export const adaptiveTtsProvider: TTSProvider = new AdaptiveTTS();

export function previewNarrator(voicePresetId: VoicePresetId, tone: "DOCUMENTARY" | "SUSPENSEFUL") {
  return new GeminiHumanTTS().generateSpeech("pratonton", "ms-MY", undefined, { voicePresetId, tone, preview: true });
}
