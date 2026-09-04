import { searchVideos, searchVisuals } from "@/lib/data/wikimedia";
import { buildVisualQueries, visualKeywords } from "@/lib/video/visualQueries";
import type { MysteryScript, StoryRecord, Topic, Visual, VisualIntent, VisualKind, VisualQualityReport } from "@/lib/types";

const programmaticIntents: Partial<Record<VisualIntent, VisualKind>> = {
  MAP: "MAP",
  TIMELINE: "TIMELINE",
  DOCUMENT: "DOCUMENT",
  NEWSPAPER: "NEWSPAPER",
  EVIDENCE: "EVIDENCE_GRAPHIC",
  FACT_CARD: "FACT_CARD",
  THEORY_CARD: "THEORY_CARD",
};

const verifiedFallbackVisuals: Record<string, Visual> = {
  "villa-nabila": { id: "commons-danga-world", title: "Danga World, Johor Bahru", url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ae/Danga_World%2C_Johor_Bahru%2C_Malaysia.jpg/1280px-Danga_World%2C_Johor_Bahru%2C_Malaysia.jpg", thumbUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ae/Danga_World%2C_Johor_Bahru%2C_Malaysia.jpg/1280px-Danga_World%2C_Johor_Bahru%2C_Malaysia.jpg", width: 1280, height: 960, creator: "Martin Lewison", license: "CC BY-SA 2.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0/", sourceUrl: "https://commons.wikimedia.org/wiki/File:Danga_World,_Johor_Bahru,_Malaysia.jpg", description: "Pemandangan kawasan Danga Bay, Johor Bahru", source: "Wikimedia Commons", mediaType: "image", visualKind: "PHOTO", relevanceScore: .5 },
};

function makeProgrammatic(story: StoryRecord, segmentIndex: number, intent: VisualIntent, query: string, backdrop?: Visual): Visual {
  const kind = programmaticIntents[intent] ?? "FACT_CARD";
  return {
    id: `factframe-${story.id}-${segmentIndex}-${kind}`,
    title: `${kind.replaceAll("_", " ")} — ${story.title}`,
    url: backdrop?.url ?? "",
    thumbUrl: backdrop?.thumbUrl ?? "",
    width: backdrop?.width ?? 720,
    height: backdrop?.height ?? 1280,
    creator: "FactFrame",
    license: backdrop?.license ?? "Grafik dijana pada peranti",
    licenseUrl: backdrop?.licenseUrl ?? "",
    sourceUrl: backdrop?.sourceUrl ?? story.sources[0]?.url ?? "",
    description: `Grafik programatik untuk ${query}`,
    source: "FactFrame",
    mediaType: "programmatic",
    visualKind: kind,
    visualIntent: intent,
    segmentIndex,
    searchQuery: query,
    relevanceScore: 1,
  };
}

function scoreCandidate(candidate: Visual, query: string, story: StoryRecord, used: Set<string>) {
  const haystack = `${candidate.title} ${candidate.description}`.toLowerCase();
  const queryTerms = visualKeywords(query);
  const topicTerms = visualKeywords(`${story.title} ${story.region}`);
  const queryMatch = queryTerms.length ? queryTerms.filter((word) => haystack.includes(word)).length / queryTerms.length : 0;
  const topicMatch = topicTerms.length ? topicTerms.filter((word) => haystack.includes(word)).length / topicTerms.length : 0;
  const resolution = Math.min(1, Math.sqrt(candidate.width * candidate.height) / 1600);
  const historical = haystack.includes(String(story.year)) ? .08 : 0;
  const duplicatePenalty = used.has(candidate.sourceUrl) || used.has(candidate.id ?? "") ? .65 : 0;
  return Math.max(0, Math.min(1, queryMatch * .46 + topicMatch * .3 + resolution * .16 + historical + .08 - duplicatePenalty));
}

function qualityReport(visuals: Visual[]): VisualQualityReport {
  const ids = visuals.map((visual) => visual.id ?? visual.sourceUrl);
  const uniqueIds = new Set(ids).size;
  const kinds = [...new Set(visuals.map((visual) => visual.visualKind ?? "PHOTO"))];
  return {
    repetitionScore: visuals.length ? uniqueIds / visuals.length : 0,
    relevanceScore: visuals.length ? visuals.reduce((sum, visual) => sum + (visual.relevanceScore ?? 0), 0) / visuals.length : 0,
    visualTypeDiversity: kinds.length,
    visualKinds: kinds,
  };
}

export async function planStoryVisuals(story: StoryRecord, script: MysteryScript) {
  const used = new Set<string>();
  const selected: Visual[] = [];
  let lastPhoto: Visual | undefined;

  for (const [segmentIndex, segment] of script.segments.entries()) {
    const queries = buildVisualQueries(story, segment.text, segment.visualIntent);
    segment.visualSearchQueries = queries;
    const query = queries[0];
    if (programmaticIntents[segment.visualIntent]) {
      selected.push(makeProgrammatic(story, segmentIndex, segment.visualIntent, query, lastPhoto));
      continue;
    }

    const [videos, images] = await Promise.all([
      searchVideos(query).catch(() => []),
      searchVisuals(query).catch(() => []),
    ]);
    const scored = [...videos, ...images].map((candidate) => ({ candidate, score: scoreCandidate(candidate, query, story, used) })).sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < .3) {
      selected.push(makeProgrammatic(story, segmentIndex, segment.visualIntent, query, lastPhoto));
      continue;
    }
    const visual = { ...best.candidate, segmentIndex, visualIntent: segment.visualIntent, searchQuery: query, relevanceScore: best.score };
    selected.push(visual);
    used.add(visual.sourceUrl); used.add(visual.id ?? "");
    if (visual.mediaType === "image") lastPhoto = visual;
  }

  if (!selected.some((visual) => visual.mediaType !== "programmatic")) {
    const fallbackQuery = story.visualSearchTerms[0] ?? story.title;
    const [videos, images] = await Promise.all([searchVideos(fallbackQuery).catch(() => []), searchVisuals(fallbackQuery).catch(() => [])]);
    const fallback = [...videos, ...images][0];
    const verified = verifiedFallbackVisuals[story.id];
    if (fallback || verified) selected[0] = { ...(fallback ?? verified), segmentIndex: 0, visualIntent: script.segments[0]?.visualIntent ?? "ARCHIVAL_PHOTO", searchQuery: fallbackQuery, relevanceScore: .5 };
  }

  return { visuals: selected, quality: qualityReport(selected) };
}

export async function planTopicVisuals(topic: Topic, script: MysteryScript) {
  const year = Number(topic.facts.map((fact) => fact.sentence).join(" ").match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/)?.[0] ?? new Date().getFullYear());
  const synthetic: StoryRecord = {
    id: topic.id, title: topic.name, country: "Global", region: topic.description, year, decade: String(year),
    category: "HISTORICAL_MYSTERY", caseStatus: "SOLVED", summary: topic.description, entityIds: [topic.id], sourceHints: script.sources.map((source) => source.publisher), visualSearchTerms: [topic.name],
    researchScore: 1, visualScore: .75, sourceCoveragePotential: "good", sources: script.sources, claims: [],
  };
  return planStoryVisuals(synthetic, script);
}
