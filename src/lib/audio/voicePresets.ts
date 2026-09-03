export type VoicePresetId = "male-documentary" | "male-mystery" | "female-documentary" | "female-calm";

export type VoicePreset = {
  id: VoicePresetId;
  label: string;
  description: string;
  geminiVoice: string;
  stylePrompt: string;
  language: "ms-MY";
};

export const DEFAULT_VOICE_PRESET_ID: VoicePresetId = "male-documentary";

export const VOICE_PRESETS: VoicePreset[] = [
  {
    id: "male-documentary", label: "Lelaki — Dokumentari", description: "Matang • Meyakinkan • Investigatif", geminiVoice: "Gacrux", language: "ms-MY",
    stylePrompt: "Sound like a calm investigative documentary narrator. Use a confident but restrained tone and steady, engaging pacing. Do not sound like an advertisement. Do not exaggerate emotion. Give slightly more emphasis to important discoveries and reveals."
  },
  {
    id: "male-mystery", label: "Lelaki — Misteri", description: "Suspens mendalam • Ketegangan terkawal", geminiVoice: "Charon", language: "ms-MY",
    stylePrompt: "Use a restrained mystery-documentary tone. Start with stronger curiosity and tension. Slow down slightly before an important reveal and use short natural pauses. Do not whisper excessively. Never sound theatrical or like a horror trailer. Stay credible and factual."
  },
  {
    id: "female-documentary", label: "Wanita — Dokumentari", description: "Jelas • Yakin • Neutral", geminiVoice: "Kore", language: "ms-MY",
    stylePrompt: "Use a clear, confident documentary narration style. Sound intelligent, natural and conversational. Maintain good pacing. Emphasize important clues without overacting. Avoid advertisement-style delivery."
  },
  {
    id: "female-calm", label: "Wanita — Tenang", description: "Hangat • Tenang • Mudah diikuti", geminiVoice: "Sulafat", language: "ms-MY",
    stylePrompt: "Use a calm, warm and controlled storytelling voice. Keep the narration easy to follow. Use gentle emphasis for important moments. Do not sound sleepy. Do not over-dramatize the mystery."
  }
];

export function getVoicePreset(id?: string) {
  return VOICE_PRESETS.find((preset) => preset.id === id) ?? VOICE_PRESETS[0];
}
