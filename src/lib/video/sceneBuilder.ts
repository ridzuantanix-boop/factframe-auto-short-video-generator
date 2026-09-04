import type { Scene, Topic, Visual } from "@/lib/types";

export function buildScenes(topic: Topic, visuals: Visual[], totalDuration = 26): Scene[] {
  if (!visuals.length) return [];
  const narrativeSegments = topic.mystery?.segments ?? [{ text: topic.narration, visualIntent: undefined, sourceIds: [] }];
  const chunks: Array<{ caption: string; visualIntent?: Scene["visualIntent"]; sourceLabel?: string; segmentIndex: number }> = [];
  for (const [segmentIndex, segment] of narrativeSegments.entries()) {
    const sentences = segment.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean) ?? [segment.text];
    for (const sentence of sentences) {
      const words = sentence.split(/\s+/);
      while (words.length > 11) chunks.push({ caption: words.splice(0, 11).join(" "), visualIntent: segment.visualIntent, sourceLabel: segment.sourceIds?.join(" · "), segmentIndex });
      if (words.length) chunks.push({ caption: words.join(" "), visualIntent: segment.visualIntent, sourceLabel: segment.sourceIds?.join(" · "), segmentIndex });
    }
  }
  const weights = chunks.map((chunk) => Math.max(1, chunk.caption.split(/\s+/).length));
  const sum = weights.reduce((a, b) => a + b, 0);
  const scenes = chunks.map((chunk, index) => ({
    image: visuals.find((visual) => visual.segmentIndex === chunk.segmentIndex) ?? visuals[index % visuals.length],
    ...chunk,
    duration: totalDuration * weights[index] / sum,
  }));
  if (topic.mystery?.showSourceNote) scenes.push({ image: visuals.at(-1) ?? visuals[0], caption: "Sumber penuh tersedia dalam penerangan", duration: 1.5, visualIntent: "ENDING" as const, sourceLabel: "SUMBER & PENYELIDIKAN", segmentIndex: narrativeSegments.length });
  return scenes;
}
