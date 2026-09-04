import { createHash } from "node:crypto";
import { createStoryStore, type StoryStore } from "../discovery/store.ts";
import { normalizeTitle } from "../discovery/normalizer.ts";
import { classifyArchiveStoryType, classifyHistoricalContext, normalizeHistoricalLocations } from "./extractor.ts";
import type { StoredStorySource } from "./types.ts";

const LEGACY_TYPES: Array<[RegExp, string]> = [
  [/\bmissing|disappear(?:ed|ance)?|vanish(?:ed)?|lost (?:man|woman|child|boy|girl|person)|search for\b/i, "DISAPPEARANCE"],
  [/\bmysterious death|found dead|body found|dead body|unexplained death\b/i, "MYSTERIOUS_DEATH"],
  [/\bmurder|shot dead|shooting|slain|homicide|assault|robbery|kidnap\b/i, "CRIME_MYSTERY"],
  [/\bghost|haunt(?:ed|ing)?|apparition|white figure|spirit\b/i, "PARANORMAL_REPORT"],
  [/\bfolklore|legend|curse|myth\b/i, "FOLKLORE"],
  [/\bstrange lights?|unexplained|mysterious|mystery|strange animal|mass hysteria\b/i, "UNEXPLAINED_EVENT"],
  [/\bdisaster|collapse|flood|fire|explosion|crash|accident|tragedy|wreck\b/i, "DISASTER"],
  [/\bpanic|rumou?r|strange|unusual|curious|abandoned\b/i, "STRANGE_EVENT"],
  [/\bincident|inquiry|investigation|police|arrest|trial|rescue|raid\b/i, "HISTORICAL_INCIDENT"],
];

function legacyStoryType(title: string, snippet: string) {
  const input = `${title}. ${snippet}`;
  return LEGACY_TYPES.find(([pattern]) => pattern.test(input))?.[1] ?? "HISTORICAL_INCIDENT";
}

function legacyHistoricalContext(input: string, locations: string[]) {
  if (/straits settlements/i.test(input)) return "STRAITS_SETTLEMENTS";
  if (/north borneo/i.test(input) || locations.includes("Sabah")) return "NORTH_BORNEO";
  if (/sarawak/i.test(input) || locations.includes("Sarawak")) return "SARAWAK";
  if (/\bmalaya(?:n)?\b|federated malay states|unfederated malay states/i.test(input)) return "MALAYA";
  return "MODERN_MALAYSIA";
}

export type ArchiveClassificationSample = { id: string; title: string; snippet: string; sourceTitle: string; publishedAt: string | null; previousStoryType: string;
  storyType: string; storyTypeConfidence: string; storyTypeEvidence: string[]; previousHistoricalContext: string; historicalContext: string; historicalContextEvidence: string[] };

function deterministic(value: string) { return createHash("sha256").update(`phase-3.1:${value}`).digest("hex"); }
function representativeSource(title: string, sources: StoredStorySource[]) {
  const normalized = normalizeTitle(title); const exact = sources.filter((source) => normalizeTitle(source.title) === normalized);
  return [...(exact.length ? exact : sources)].sort((a, b) => b.snippet.length - a.snippet.length)[0];
}

export async function reclassifyArchiveRecords(store: StoryStore = createStoryStore()) {
  await store.migrate(); const candidates = await store.listArchiveCandidatesForClassification(); const sources = await store.listArchiveSourcesForClassification();
  const byCandidate = Map.groupBy(sources, (source) => source.storyCandidateId); const historicalContextCounts: Record<string, number> = {};
  const confidenceDistribution = { HIGH: 0, MEDIUM: 0, LOW: 0 }; let previouslyModernMalaysia = 0; let historicalContextChanges = 0; let storyTypeChanges = 0;
  const samplePool: ArchiveClassificationSample[] = [];
  for (const candidate of candidates) {
    const linked = byCandidate.get(candidate.id) ?? []; const representative = representativeSource(candidate.title, linked);
    const sourceTitle = representative?.title ?? candidate.title; const snippet = representative?.snippet ?? candidate.summary;
    const publishedAt = representative?.publishedAt ?? null; const locationEvidence = normalizeHistoricalLocations(`${sourceTitle} ${snippet} ${candidate.region}`);
    const locations = [...new Set([...locationEvidence.map((item) => item.display), candidate.region].filter((item) => item && item !== "Unknown"))];
    const contextInput = `${sourceTitle} ${snippet}`; const context = classifyHistoricalContext(contextInput, locations, publishedAt);
    const classification = classifyArchiveStoryType(sourceTitle, snippet); const previousContext = legacyHistoricalContext(contextInput, locations);
    const previousStoryType = legacyStoryType(sourceTitle, snippet); if (previousContext === "MODERN_MALAYSIA") previouslyModernMalaysia += 1;
    if (previousContext === "MODERN_MALAYSIA" && context.historicalContext !== "MODERN_MALAYSIA") historicalContextChanges += 1;
    if (previousStoryType !== classification.storyType) storyTypeChanges += 1;
    historicalContextCounts[context.historicalContext] = (historicalContextCounts[context.historicalContext] ?? 0) + 1;
    confidenceDistribution[classification.storyTypeConfidence] += 1;
    const metadata = { ...candidate.metadata, historicalContext: context.historicalContext, historicalContextEvidence: context.evidence,
      storyTypeConfidence: classification.storyTypeConfidence, storyTypeEvidence: classification.storyTypeEvidence,
      claimStatus: classification.claimStatus, classificationVersion: "3.1-archive-scored" };
    await store.updateArchiveClassification(candidate.id, classification.storyType, metadata);
    for (const source of linked) {
      const sourceLocations = normalizeHistoricalLocations(`${source.title} ${source.snippet} ${(source.metadata.extractedLocations as string[] | undefined)?.join(" ") ?? ""}`);
      const normalizedLocations = [...new Set(sourceLocations.map((item) => item.display))];
      const sourceContext = classifyHistoricalContext(`${source.title} ${source.snippet}`, normalizedLocations, source.publishedAt);
      const sourceType = classifyArchiveStoryType(source.title, source.snippet);
      await store.updateArchiveSourceMetadata(source.id, { ...source.metadata, historicalContext: sourceContext.historicalContext,
        historicalContextEvidence: sourceContext.evidence, storyType: sourceType.storyType, storyTypeConfidence: sourceType.storyTypeConfidence,
        storyTypeEvidence: sourceType.storyTypeEvidence, claimStatus: sourceType.claimStatus, classificationVersion: "3.1-archive-scored" });
    }
    if (candidate.status !== "HIDDEN") samplePool.push({ id: candidate.id, title: candidate.title, snippet: snippet.slice(0, 500), sourceTitle,
      publishedAt, previousStoryType, storyType: classification.storyType, storyTypeConfidence: classification.storyTypeConfidence,
      storyTypeEvidence: classification.storyTypeEvidence, previousHistoricalContext: previousContext, historicalContext: context.historicalContext,
      historicalContextEvidence: context.evidence });
  }
  const sample = samplePool.sort((a, b) => deterministic(a.id).localeCompare(deterministic(b.id))).slice(0, 100);
  return { generatedAt: new Date().toISOString(), archiveCandidatesProcessed: candidates.length, archiveSourcesProcessed: sources.length,
    previouslyModernMalaysia, historicalContextChanges, historicalContextCounts, storyTypeChanges, confidenceDistribution, sample };
}
