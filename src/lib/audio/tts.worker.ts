/// <reference lib="webworker" />

import * as ort from "onnxruntime-web";

const workerScope = self as DedicatedWorkerGlobalScope;
const MODEL_URL = "https://huggingface.co/willwade/mms-tts-multilingual-models-onnx/resolve/main/zlm/model.onnx";
const SAMPLE_RATE = 16_000;
const PAUSE_SECONDS = 0.16;

const TOKEN_IDS: Record<string, number> = {
  y: 0, g: 1, " ": 2, f: 3, e: 4, t: 5, o: 6, "5": 7, j: 8, _: 9,
  "3": 10, k: 11, "–": 12, i: 13, a: 14, "0": 15, n: 16, "6": 17,
  d: 18, u: 19, c: 20, "'": 21, h: 22, q: 23, "-": 24, p: 25,
  m: 26, w: 27, r: 28, "4": 29, s: 30, l: 31, b: 32, z: 33,
};

function numberBelowThousand(value: number): string {
  const ones = ["kosong", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "lapan", "sembilan"];
  if (value < 10) return ones[value];
  if (value === 10) return "sepuluh";
  if (value === 11) return "sebelas";
  if (value < 20) return `${ones[value - 10]} belas`;
  if (value < 100) return `${ones[Math.floor(value / 10)]} puluh${value % 10 ? ` ${ones[value % 10]}` : ""}`;
  if (value < 200) return `seratus${value > 100 ? ` ${numberBelowThousand(value - 100)}` : ""}`;
  return `${ones[Math.floor(value / 100)]} ratus${value % 100 ? ` ${numberBelowThousand(value % 100)}` : ""}`;
}

function numberToMalay(value: number): string {
  if (value < 1_000) return numberBelowThousand(value);
  if (value < 2_000) return `seribu${value > 1_000 ? ` ${numberBelowThousand(value - 1_000)}` : ""}`;
  if (value < 1_000_000) return `${numberBelowThousand(Math.floor(value / 1_000))} ribu${value % 1_000 ? ` ${numberBelowThousand(value % 1_000)}` : ""}`;
  return String(value).split("").map((digit) => numberBelowThousand(Number(digit))).join(" ");
}

function normaliseText(text: string): string {
  return text
    .replace(/\d+/g, (match) => numberToMalay(Number(match)))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z'–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTokenIds(text: string): bigint[] {
  const ids = [...normaliseText(text)].flatMap((character) => {
    const id = TOKEN_IDS[character];
    return id === undefined ? [] : [BigInt(id)];
  });
  const withBlanks: bigint[] = [BigInt(0)];
  for (const id of ids) withBlanks.push(id, BigInt(0));
  return withBlanks;
}

function splitNarration(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? [text];
  const chunks: string[] = [];
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    for (let index = 0; index < words.length; index += 24) chunks.push(words.slice(index, index + 24).join(" "));
  }
  return chunks;
}

function concatenateAudio(parts: Float32Array[]): Float32Array {
  const pause = new Float32Array(Math.round(SAMPLE_RATE * PAUSE_SECONDS));
  const length = parts.reduce((sum, part) => sum + part.length, 0) + Math.max(0, parts.length - 1) * pause.length;
  const output = new Float32Array(length);
  let offset = 0;
  parts.forEach((part, index) => {
    output.set(part, offset);
    offset += part.length;
    if (index < parts.length - 1) offset += pause.length;
  });
  return output;
}

function encodeWav(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  writeText(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); writeText(8, "WAVE");
  writeText(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeText(36, "data"); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true));
  return buffer;
}

async function fetchModel(): Promise<ArrayBuffer> {
  workerScope.postMessage({ type: "progress", message: "Memuat turun suara neural (sekali sahaja)", percent: 8 });
  const response = await fetch(MODEL_URL);
  if (!response.ok) throw new Error("Model suara neural tidak dapat dimuat turun.");
  if (!response.body) return response.arrayBuffer();
  const total = Number(response.headers.get("content-length")) || 114_013_880;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); received += value.length;
    workerScope.postMessage({ type: "progress", message: `Memuat turun suara neural · ${Math.round(received / 1_048_576)} MB`, percent: 8 + Math.round(received / total * 32) });
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes.buffer;
}

workerScope.onmessage = async (event: MessageEvent<{ text: string; targetDurationSeconds?: number }>) => {
  try {
    ort.env.wasm.wasmPaths = "/vendor/ort/";
    ort.env.wasm.numThreads = 1;
    const model = await fetchModel();
    workerScope.postMessage({ type: "progress", message: "Menghidupkan suara neural Bahasa Melayu", percent: 44 });
    const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
    const chunks = splitNarration(event.data.text);
    const wordCount = event.data.text.trim().split(/\s+/).length;
    const targetLengthScale = event.data.targetDurationSeconds ? Math.max(0.58, Math.min(1.05, event.data.targetDurationSeconds * 1.65 / Math.max(1, wordCount))) : 0.92;
    const audioParts: Float32Array[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const ids = toTokenIds(chunks[index]);
      const feeds: Record<string, ort.Tensor> = {
        x: new ort.Tensor("int64", BigInt64Array.from(ids), [1, ids.length]),
        x_length: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
        noise_scale: new ort.Tensor("float32", Float32Array.from([0.55]), [1]),
        length_scale: new ort.Tensor("float32", Float32Array.from([targetLengthScale]), [1]),
        noise_scale_w: new ort.Tensor("float32", Float32Array.from([0.7]), [1]),
      };
      const result = await session.run(feeds);
      audioParts.push(result.y.data as Float32Array);
      workerScope.postMessage({ type: "progress", message: `Merakam suara manusia · ayat ${index + 1}/${chunks.length}`, percent: 48 + Math.round((index + 1) / chunks.length * 47) });
    }
    const wav = encodeWav(concatenateAudio(audioParts));
    workerScope.postMessage({ type: "done", wav }, [wav]);
  } catch (error) {
    workerScope.postMessage({ type: "error", error: error instanceof Error ? error.message : "Sintesis suara neural Bahasa Melayu gagal." });
  }
};
