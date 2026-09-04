import "server-only";
import { GoogleGenAI } from "@google/genai";

export function getGeminiClient() {
  if (process.env.DEMO_MODE === "true") return null;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

export const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.7-flash";
export const GEMINI_TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";
export const DEMO_MODE = process.env.DEMO_MODE === "true";
