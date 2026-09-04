import { buildScenes } from "@/lib/video/sceneBuilder";
import type { Scene, Topic, Visual, WatermarkConfig } from "@/lib/types";

export type RenderProgress = (message: string, percent: number) => void;

const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 30;

type LoadedMedia = { bitmap?: ImageBitmap; video?: HTMLVideoElement };

async function loadBitmap(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Salah satu imej sumber tidak dapat dimuatkan.");
  return createImageBitmap(await response.blob());
}

async function loadMedia(visual: Visual): Promise<LoadedMedia> {
  if (visual.mediaType === "video") {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const ready = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Klip video mengambil masa terlalu lama untuk dimuatkan.")), 20000);
      video.onloadeddata = () => { window.clearTimeout(timeout); resolve(); };
      video.onerror = () => { window.clearTimeout(timeout); reject(new Error("Format klip video tidak dapat dimainkan.")); };
    });
    video.src = visual.url;
    try { await ready; return { video }; }
    catch { if (visual.thumbUrl) { try { return { bitmap: await loadBitmap(visual.thumbUrl) }; } catch { return {}; } } }
  }
  if (visual.thumbUrl) { try { return { bitmap: await loadBitmap(visual.thumbUrl) }; } catch { return {}; } }
  return {};
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3) {
  const words = text.split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) { const visible = lines.slice(0, maxLines); visible[maxLines - 1] = `${visible[maxLines - 1].replace(/[.,;:]?$/, "")}…`; return visible; }
  return lines;
}

function mediaDimensions(media: LoadedMedia) {
  if (media.video) return { width: media.video.videoWidth, height: media.video.videoHeight };
  if (media.bitmap) return { width: media.bitmap.width, height: media.bitmap.height };
  return { width: WIDTH, height: HEIGHT };
}

function drawMedia(ctx: CanvasRenderingContext2D, media: LoadedMedia, scene: Scene, sceneIndex: number, progress: number) {
  const source = media.video ?? media.bitmap;
  if (!source) {
    const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    gradient.addColorStop(0, "#243845"); gradient.addColorStop(1, "#071018");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, WIDTH, HEIGHT); return;
  }
  const { width, height } = mediaDimensions(media);
  const ratio = width / height;
  const isArchival = Boolean(media.video && ratio > 1.18 && ratio < 1.55);
  if (isArchival) {
    const bgScale = Math.max(WIDTH / width, HEIGHT / height);
    ctx.save(); ctx.filter = "blur(24px) brightness(.48)"; ctx.drawImage(source, (WIDTH - width * bgScale) / 2, (HEIGHT - height * bgScale) / 2, width * bgScale, height * bgScale); ctx.restore();
    const scale = Math.min((WIDTH - 64) / width, (HEIGHT - 210) / height);
    ctx.drawImage(source, (WIDTH - width * scale) / 2, (HEIGHT - height * scale) / 2, width * scale, height * scale);
    return;
  }
  const motion = media.video ? 1 : 1.04 + progress * .06;
  const scale = Math.max(WIDTH / width, HEIGHT / height) * motion;
  const dw = width * scale; const dh = height * scale;
  const dx = -(Math.max(0, dw - WIDTH) * (media.video ? .5 : sceneIndex % 2 ? 1 - progress : progress));
  const dy = -(Math.max(0, dh - HEIGHT) * (media.video ? .5 : .35 + progress * .3));
  ctx.drawImage(source, dx, dy, dw, dh);
}

function drawProgrammatic(ctx: CanvasRenderingContext2D, topic: Topic, scene: Scene, progress: number) {
  const intent = scene.visualIntent;
  if (!scene.image || scene.image.mediaType !== "programmatic") return;
  ctx.fillStyle = "rgba(4,12,18,.68)"; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = "rgba(213,255,77,.7)"; ctx.fillStyle = "#d5ff4d"; ctx.lineWidth = 5;
  if (intent === "MAP" || intent === "EVIDENCE") {
    const points = [[95, 360], [245, 430], [390, 390], [610, 585]] as const;
    ctx.beginPath(); points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.setLineDash([14, 12]); ctx.stroke(); ctx.setLineDash([]);
    points.forEach(([x, y], index) => { ctx.beginPath(); ctx.arc(x, y, index === points.length - 1 ? 13 : 8, 0, Math.PI * 2); ctx.fill(); });
    ctx.font = "800 24px Arial"; ctx.fillText(intent === "MAP" ? "LALUAN & LOKASI" : "JEJAK BUKTI", 70, 300);
  } else if (intent === "TIMELINE") {
    ctx.fillRect(86, 425, 548 * progress, 6); [86, 270, 454, 634].forEach((x) => { ctx.beginPath(); ctx.arc(x, 428, 11, 0, Math.PI * 2); ctx.fill(); });
    const year = scene.image.searchQuery?.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/)?.[0] ?? "";
    ctx.font = "800 54px Arial"; if (year) ctx.fillText(year, 80, 365);
    ctx.font = "800 24px Arial"; ctx.fillText("GARIS MASA PERISTIWA", 80, 505);
  } else {
    ctx.strokeRect(80, 280, 560, 390); ctx.fillRect(80, 280, 560, 12);
    ctx.font = "800 25px Arial"; ctx.fillText((scene.image.visualKind ?? "BUKTI").replaceAll("_", " "), 110, 345);
    ctx.fillStyle = "rgba(255,255,255,.84)"; ctx.font = "600 30px Georgia";
    wrapText(ctx, scene.caption, 470, 4).forEach((line, index) => ctx.fillText(line, 110, 420 + index * 48));
  }
}

function drawWatermark(ctx: CanvasRenderingContext2D, config?: WatermarkConfig) {
  if (!config?.enabled || !config.text.trim()) return;
  const fontSize = config.size === "LARGE" ? 34 : config.size === "MEDIUM" ? 27 : 21;
  const horizontal = config.position.endsWith("LEFT") ? "left" : config.position.endsWith("RIGHT") ? "right" : "center";
  const x = horizontal === "left" ? 54 : horizontal === "right" ? WIDTH - 112 : WIDTH / 2;
  const y = config.position.startsWith("TOP") ? 135 : config.position.startsWith("MIDDLE") || config.position === "CENTER" ? 690 : 925;
  ctx.save(); ctx.globalAlpha = config.opacity; ctx.textAlign = horizontal; ctx.textBaseline = "middle"; ctx.font = `700 ${fontSize}px Arial, sans-serif`;
  ctx.lineWidth = 5; ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.strokeText(config.text, x, y); ctx.fillStyle = "#fff"; ctx.fillText(config.text, x, y); ctx.restore();
}

function drawFrame(ctx: CanvasRenderingContext2D, media: LoadedMedia, topic: Topic, scene: Scene, sceneIndex: number, progress: number, watermark?: WatermarkConfig) {
  ctx.fillStyle = "#071018"; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawMedia(ctx, media, scene, sceneIndex, progress); drawProgrammatic(ctx, topic, scene, progress);
  const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT); gradient.addColorStop(0, "rgba(4,12,18,.28)"); gradient.addColorStop(.48, "rgba(4,12,18,.08)"); gradient.addColorStop(1, "rgba(4,12,18,.92)"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "rgba(7,16,24,.72)"; roundedRect(ctx, 44, 48, 240, 48, 24); ctx.fillStyle = "#d5ff4d"; ctx.font = "700 18px Arial, sans-serif"; ctx.fillText(topic.contentMode === "STORY" ? "CERITA BERSUMBER" : topic.mystery ? "MISTERI BERSUMBER" : "CERITA BERSUMBER", 70, 80);
  const labels: Partial<Record<NonNullable<Scene["visualIntent"]>, string>> = { MAP: "LOKASI", TIMELINE: "GARIS MASA", THEORY_CARD: "TEORI", FACT_CARD: "FAKTA DIREKODKAN", DOCUMENT: "DOKUMEN", NEWSPAPER: "LAPORAN ARKIB", EVIDENCE: "BUKTI", ENDING: "SUMBER & PENYELIDIKAN" };
  const label = scene.visualIntent ? labels[scene.visualIntent] : undefined;
  if (label) { ctx.fillStyle = scene.visualIntent === "THEORY_CARD" ? "#ffb36b" : "#d5ff4d"; ctx.font = "800 22px Arial"; ctx.fillText(label, 50, sceneIndex ? 170 : 420); ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.font = "600 14px Arial"; if (scene.sourceLabel) ctx.fillText(scene.sourceLabel.toUpperCase().slice(0, 54), 50, sceneIndex ? 198 : 448); }
  if (!sceneIndex) { ctx.fillStyle = "#fff"; ctx.font = "800 64px Arial"; const titleLines = wrapText(ctx, topic.name, 620, 3); titleLines.forEach((line, index) => ctx.fillText(line, 50, 180 + index * 72)); ctx.fillStyle = "#d5ff4d"; ctx.font = "600 25px Arial"; ctx.fillText(topic.description.toUpperCase().slice(0, 52), 52, 200 + titleLines.length * 72); }
  ctx.globalAlpha = Math.min(1, progress * 5); ctx.font = "700 39px Arial"; const lines = wrapText(ctx, scene.caption, 604, 3); const boxHeight = lines.length * 50 + 64; ctx.fillStyle = "rgba(6,14,22,.86)"; roundedRect(ctx, 38, HEIGHT - boxHeight - 100, 644, boxHeight, 28); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; lines.forEach((line, index) => ctx.fillText(line, WIDTH / 2, HEIGHT - boxHeight - 57 + index * 50)); ctx.textAlign = "left"; ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(255,255,255,.22)"; roundedRect(ctx, 50, HEIGHT - 54, 620, 6, 3); ctx.fillStyle = "#d5ff4d"; roundedRect(ctx, 50, HEIGHT - 54, 620 * progress, 6, 3);
  drawWatermark(ctx, watermark);
}

async function transcodeToMp4(webm: Blob, onProgress: RenderProgress) {
  onProgress("Menyiapkan fail MP4", 93);
  const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]); const ffmpeg = new FFmpeg();
  ffmpeg.on("progress", ({ progress }) => onProgress("Menyiapkan fail MP4", 93 + Math.max(0, Math.min(1, progress)) * 6));
  const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd"; await ffmpeg.load({ coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"), wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm") });
  await ffmpeg.writeFile("capture.webm", await fetchFile(webm)); await ffmpeg.exec(["-i", "capture.webm", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "output.mp4"]);
  const output = await ffmpeg.readFile("output.mp4"); ffmpeg.terminate(); return new Blob([new Uint8Array(output as Uint8Array)], { type: "video/mp4" });
}

export async function renderVideo(topic: Topic, visuals: Visual[], narration: Blob, onProgress: RenderProgress, watermark?: WatermarkConfig) {
  const canvas = document.createElement("canvas"); canvas.width = WIDTH; canvas.height = HEIGHT; const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Pelayar ini tidak dapat menyediakan kanvas video.");
  onProgress("Menyediakan klip dan visual", 5); const loaded = await Promise.all(visuals.map(loadMedia)); if (!loaded.length) throw new Error("Visual yang sesuai tidak mencukupi.");
  const audioContext = new AudioContext(); const audioBuffer = await audioContext.decodeAudioData(await narration.arrayBuffer()); const targetDuration = topic.mystery?.durationTarget; const playbackRate = targetDuration ? Math.max(.88, Math.min(1.18, audioBuffer.duration / targetDuration)) : 1; const effectiveDuration = audioBuffer.duration / playbackRate; const scenes = buildScenes(topic, visuals, effectiveDuration); const source = audioContext.createBufferSource(); source.buffer = audioBuffer; source.playbackRate.value = playbackRate; const audioDestination = audioContext.createMediaStreamDestination(); const gain = audioContext.createGain(); gain.gain.value = 1; source.connect(gain).connect(audioDestination);
  const canvasStream = canvas.captureStream(FPS); audioDestination.stream.getAudioTracks().forEach((track) => canvasStream.addTrack(track)); const directMp4 = MediaRecorder.isTypeSupported("video/mp4;codecs=avc1.42E01E,mp4a.40.2"); const mimeType = directMp4 ? "video/mp4;codecs=avc1.42E01E,mp4a.40.2" : "video/webm;codecs=vp9,opus"; const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 5_000_000 }); const chunks: BlobPart[] = []; recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); }; const finished = new Promise<void>((resolve, reject) => { recorder.onstop = () => resolve(); recorder.onerror = () => reject(new Error("Perakam video pelayar gagal berfungsi.")); });
  let sceneIndex = 0; let sceneStart = 0; let activeVideo: HTMLVideoElement | undefined; const recordingDuration = scenes.reduce((sum, scene) => sum + scene.duration, 0) + .35; const startedAt = performance.now(); recorder.start(1000); source.start(); onProgress("Merender pada peranti ini", 18);
  await new Promise<void>((resolve) => { const tick = () => { const elapsed = (performance.now() - startedAt) / 1000; while (sceneIndex < scenes.length - 1 && elapsed >= sceneStart + scenes[sceneIndex].duration) { sceneStart += scenes[sceneIndex].duration; sceneIndex++; } const scene = scenes[sceneIndex]; const visualIndex = Math.max(0, visuals.indexOf(scene.image)); const media = loaded[visualIndex] ?? loaded[0]; if (media.video !== activeVideo) { activeVideo?.pause(); activeVideo = media.video; if (activeVideo) { const usable = Math.max(0, activeVideo.duration - Math.min(6, scene.duration)); activeVideo.currentTime = usable ? (sceneIndex * 3.17) % usable : 0; void activeVideo.play().catch(() => undefined); } } drawFrame(ctx, media, topic, scene, sceneIndex, Math.min(1, (elapsed - sceneStart) / scene.duration), watermark); onProgress("Merender pada peranti ini", 18 + Math.min(1, elapsed / recordingDuration) * 72); if (elapsed < recordingDuration) requestAnimationFrame(tick); else resolve(); }; tick(); });
  activeVideo?.pause(); recorder.stop(); source.stop(); await finished; await audioContext.close(); loaded.forEach((media) => { media.bitmap?.close(); if (media.video) { media.video.pause(); media.video.removeAttribute("src"); media.video.load(); } }); const capture = new Blob(chunks, { type: mimeType }); const result = directMp4 ? capture : await transcodeToMp4(capture, onProgress); onProgress("Video siap", 100); return result;
}
