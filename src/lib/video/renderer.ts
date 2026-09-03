import { buildScenes } from "@/lib/video/sceneBuilder";
import type { Scene, Topic, Visual } from "@/lib/types";

export type RenderProgress = (message: string, percent: number) => void;

const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 30;

async function loadBitmap(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Salah satu imej sumber tidak dapat dimuatkan.");
  return createImageBitmap(await response.blob());
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const visible = lines.slice(0, maxLines);
    visible[maxLines - 1] = `${visible[maxLines - 1].replace(/[.,;:]?$/, "")}…`;
    return visible;
  }
  return lines;
}

function drawFrame(ctx: CanvasRenderingContext2D, bitmap: ImageBitmap, topic: Topic, scene: Scene, sceneIndex: number, progress: number) {
  ctx.fillStyle = "#071018";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const scale = Math.max(WIDTH / bitmap.width, HEIGHT / bitmap.height) * (1.04 + progress * 0.06);
  const dw = bitmap.width * scale;
  const dh = bitmap.height * scale;
  const travelX = Math.max(0, dw - WIDTH);
  const travelY = Math.max(0, dh - HEIGHT);
  const dx = -(travelX * (sceneIndex % 2 ? 1 - progress : progress));
  const dy = -(travelY * (0.35 + progress * 0.3));
  ctx.drawImage(bitmap, dx, dy, dw, dh);

  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  gradient.addColorStop(0, "rgba(4,12,18,.28)");
  gradient.addColorStop(.48, "rgba(4,12,18,.08)");
  gradient.addColorStop(1, "rgba(4,12,18,.92)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(7,16,24,.72)";
  roundedRect(ctx, 44, 48, 210, 48, 24);
  ctx.fillStyle = "#d5ff4d";
  ctx.font = "700 18px Arial, sans-serif";
  ctx.fillText(topic.mystery ? "MISTERI BERSUMBER" : "FAKTA RINGKAS", 70, 80);

  const sceneLabels: Partial<Record<NonNullable<Scene["visualIntent"]>, string>> = { MAP: "LOKASI", TIMELINE: "GARIS MASA", THEORY_CARD: "TEORI", FACT_CARD: "FAKTA DIREKODKAN", DOCUMENT: "DOKUMEN", NEWSPAPER: "LAPORAN ARKIB", EVIDENCE: "BUKTI", ENDING: "SUMBER & PENYELIDIKAN" };
  const sceneLabel = scene.visualIntent ? sceneLabels[scene.visualIntent] : undefined;
  if (sceneLabel) {
    ctx.fillStyle = scene.visualIntent === "THEORY_CARD" ? "#ffb36b" : "#d5ff4d";
    ctx.font = "800 22px Arial, sans-serif";
    ctx.fillText(sceneLabel, 50, sceneIndex === 0 ? 420 : 170);
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.font = "600 14px Arial, sans-serif";
    if (scene.sourceLabel) ctx.fillText(scene.sourceLabel.toUpperCase().slice(0, 54), 50, sceneIndex === 0 ? 448 : 198);
  }

  if (sceneIndex === 0) {
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 64px Arial, sans-serif";
    const titleLines = wrapText(ctx, topic.name, 620, 3);
    titleLines.forEach((line, i) => ctx.fillText(line, 50, 180 + i * 72));
    ctx.fillStyle = "#d5ff4d";
    ctx.font = "600 25px Arial, sans-serif";
    ctx.fillText(topic.description.toUpperCase().slice(0, 52), 52, 200 + titleLines.length * 72);
  }

  const eased = Math.min(1, progress * 5);
  ctx.globalAlpha = eased;
  ctx.font = "700 39px Arial, sans-serif";
  const lines = wrapText(ctx, scene.caption, 604, 3);
  const boxHeight = lines.length * 50 + 64;
  ctx.fillStyle = "rgba(6,14,22,.86)";
  roundedRect(ctx, 38, HEIGHT - boxHeight - 100, 644, boxHeight, 28);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  lines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, HEIGHT - boxHeight - 57 + i * 50));
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255,255,255,.22)";
  roundedRect(ctx, 50, HEIGHT - 54, 620, 6, 3);
  ctx.fillStyle = "#d5ff4d";
  roundedRect(ctx, 50, HEIGHT - 54, 620 * progress, 6, 3);
}

async function transcodeToMp4(webm: Blob, onProgress: RenderProgress) {
  onProgress("Menyiapkan fail MP4", 93);
  const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
  const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => onProgress("Menyiapkan fail MP4", 93 + Math.max(0, Math.min(1, progress)) * 6));
  const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
  await ffmpeg.load({ coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"), wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm") });
  await ffmpeg.writeFile("capture.webm", await fetchFile(webm));
  await ffmpeg.exec(["-i", "capture.webm", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "output.mp4"]);
  const output = await ffmpeg.readFile("output.mp4");
  ffmpeg.terminate();
  return new Blob([new Uint8Array(output as Uint8Array)], { type: "video/mp4" });
}

export async function renderVideo(topic: Topic, visuals: Visual[], narration: Blob, onProgress: RenderProgress) {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Pelayar ini tidak dapat menyediakan kanvas video.");
  onProgress("Menyediakan visual", 5);
  const bitmaps = await Promise.all(visuals.slice(0, 6).map((visual) => loadBitmap(visual.thumbUrl)));
  if (!bitmaps.length) throw new Error("Visual yang sesuai tidak mencukupi.");

  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(await narration.arrayBuffer());
  const scenes = buildScenes(topic, visuals, audioBuffer.duration);
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  const audioDestination = audioContext.createMediaStreamDestination();
  const gain = audioContext.createGain();
  gain.gain.value = 1;
  source.connect(gain).connect(audioDestination);

  const canvasStream = canvas.captureStream(FPS);
  audioDestination.stream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
  const directMp4 = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E,mp4a.40.2");
  const mimeType = directMp4 ? "video/mp4;codecs=avc1.42E01E,mp4a.40.2" : "video/webm;codecs=vp9,opus";
  const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 5_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const finished = new Promise<void>((resolve, reject) => { recorder.onstop = () => resolve(); recorder.onerror = () => reject(new Error("Perakam video pelayar gagal berfungsi.")); });

  let sceneIndex = 0;
  let sceneStart = 0;
  const recordingDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0) + 0.35;
  const startedAt = performance.now();
  recorder.start(1000);
  source.start();
  onProgress("Merender pada peranti ini", 18);
  await new Promise<void>((resolve) => {
    const tick = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      while (sceneIndex < scenes.length - 1 && elapsed >= sceneStart + scenes[sceneIndex].duration) {
        sceneStart += scenes[sceneIndex].duration;
        sceneIndex++;
      }
      const scene = scenes[sceneIndex];
      drawFrame(ctx, bitmaps[sceneIndex % bitmaps.length], topic, scene, sceneIndex, Math.min(1, (elapsed - sceneStart) / scene.duration));
      onProgress("Merender pada peranti ini", 18 + Math.min(1, elapsed / recordingDuration) * 72);
      if (elapsed < recordingDuration) requestAnimationFrame(tick);
      else resolve();
    };
    tick();
  });
  recorder.stop();
  source.stop();
  await finished;
  await audioContext.close();
  bitmaps.forEach((bitmap) => bitmap.close());
  const capture = new Blob(chunks, { type: mimeType });
  const result = directMp4 ? capture : await transcodeToMp4(capture, onProgress);
  onProgress("Video siap", 100);
  return result;
}
