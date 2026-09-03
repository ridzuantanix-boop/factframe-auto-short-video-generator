import type { Scene, Topic, Visual } from "@/lib/types";

export function buildScenes(topic: Topic, visuals: Visual[], totalDuration = 26): Scene[] {
  const usableVisuals = visuals.length ? visuals : [];
  if (!usableVisuals.length) return [];
  const narrativeSegments = topic.mystery?.segments ?? [{ text: topic.narration, visualIntent: undefined, sourceIds: [] }];
  const chunks: Array<{ caption: string; visualIntent?: Scene["visualIntent"]; sourceLabel?: string }> = [];
  for (const segment of narrativeSegments) {
    const sentences = segment.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) ?? [segment.text];
    for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
      while (words.length > 11) chunks.push({ caption: words.splice(0, 11).join(" "), visualIntent: segment.visualIntent, sourceLabel: segment.sourceIds?.join(" · ") });
      if (words.length) chunks.push({ caption: words.join(" "), visualIntent: segment.visualIntent, sourceLabel: segment.sourceIds?.join(" · ") });
    }
  }
  const weights = chunks.map((chunk) => Math.max(1, chunk.caption.split(/\s+/).length));
  const sum = weights.reduce((a, b) => a + b, 0);
  const scenes = chunks.map((chunk, index) => ({
    image: usableVisuals[index % usableVisuals.length],
    ...chunk,
    duration: totalDuration * weights[index] / sum,
  }));
  if (topic.mystery?.showSourceNote) scenes.push({ image: usableVisuals[0], caption: "Sumber penuh tersedia dalam penerangan", duration: 1.5, visualIntent: "ENDING", sourceLabel: "SUMBER & PENYELIDIKAN" });
  return scenes;
}
