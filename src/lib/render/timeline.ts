import type { MysteryScript } from "../types.ts";
import type { VisualPlan } from "../visual/types.ts";
import type { VisualAssetRecord } from "../visual/types.ts";

export type CaptionCue = { id: string; text: string; startMs: number; endMs: number; segmentIndex: number };
export type RenderScene = { sceneId: string; startMs: number; endMs: number; assetId: string; visualType: string; claimIds: string[]; sourceIds: string[]; transition: "CUT" | "CROSSFADE"; motion: "SLOW_ZOOM" | "SLOW_PAN" | "NONE" };

const words = (value: string) => value.trim().split(/\s+/).filter(Boolean);
const weight = (text: string) => words(text).length + (text.match(/[,.!?;:]/g)?.length ?? 0) * .35;

export function buildSegmentTimeline(script: MysteryScript, plan: VisualPlan, actualAudioSeconds: number): RenderScene[] {
  if (!(actualAudioSeconds > 0)) throw new Error("Actual audio duration must be positive.");
  const segments = script.segments.slice(0, plan.segments.length); const weights = segments.map((segment) => Math.max(1, weight(segment.text)));
  const total = weights.reduce((sum, value) => sum + value, 0); let cursor = 0;
  return segments.map((segment, index) => {
    const startMs = cursor; const endMs = index === segments.length - 1 ? Math.round(actualAudioSeconds * 1000) : cursor + Math.round(actualAudioSeconds * 1000 * weights[index] / total);
    cursor = endMs; const visual = plan.segments[index]; const asset = plan.assets.find((item) => item.id === visual?.assetIds[0]);
    return { sceneId: visual?.segmentId ?? `${script.storyId}-${index}`, startMs, endMs, assetId: visual?.assetIds[0] ?? "", visualType: asset?.assetType ?? "FACT_CARD",
      claimIds: segment.claimIds ?? [], sourceIds: segment.sourceIds, transition: index ? "CROSSFADE" : "CUT", motion: asset?.assetType === "MAP" || asset?.provider === "FACTFRAME" ? "NONE" : index % 2 ? "SLOW_PAN" : "SLOW_ZOOM" };
  });
}

export function buildCaptionCues(script: MysteryScript, scenes: RenderScene[]): CaptionCue[] {
  const cues: CaptionCue[] = [];
  script.segments.slice(0, scenes.length).forEach((segment, segmentIndex) => {
    const scene = scenes[segmentIndex]; const tokens = words(segment.text); const chunks: string[] = [];
    while (tokens.length) { const remaining = tokens.length; const size = remaining <= 8 ? remaining : Math.min(8, Math.max(3, Math.ceil(remaining / Math.ceil(remaining / 6)))); chunks.push(tokens.splice(0, size).join(" ")); }
    const weights = chunks.map(weight), sum = weights.reduce((a, b) => a + b, 0); let cursor = scene.startMs;
    chunks.forEach((text, index) => { const endMs = index === chunks.length - 1 ? scene.endMs : cursor + Math.round((scene.endMs - scene.startMs) * weights[index] / sum);
      cues.push({ id: `caption-${segmentIndex}-${index}`, text, startMs: cursor, endMs, segmentIndex }); cursor = endMs; });
  });
  return cues;
}

export function selectRecorderMime(isSupported: (mime: string) => boolean) {
  const choices = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  const mimeType = choices.find(isSupported); if (!mimeType) throw new Error("Tiada codec rakaman video yang disokong pelayar ini.");
  return { mimeType, container: mimeType.startsWith("video/mp4") ? "mp4" as const : "webm" as const, extension: mimeType.startsWith("video/mp4") ? ".mp4" as const : ".webm" as const };
}

export function renderCacheKey(researchHash: string, visualPlanHash: string, narrationHash: string, voice: string) { return `${researchHash}:${visualPlanHash}:${narrationHash}:${voice}`; }

export function resolveRenderableAsset(primary: VisualAssetRecord, fallback: VisualAssetRecord) {
  if (primary.usageStatus === "RESTRICTED_REFERENCE" || primary.usageStatus === "REJECTED" || primary.metadata.broken === true) return { asset: fallback, substituted: true };
  return { asset: primary, substituted: false };
}

export function captionCoverage(script: MysteryScript, cues: CaptionCue[]) { const expected = words(script.segments.map((item) => item.text).join(" ")).length; const actual = words(cues.map((item) => item.text).join(" ")).length; return Math.min(1, actual / Math.max(1, expected)); }
