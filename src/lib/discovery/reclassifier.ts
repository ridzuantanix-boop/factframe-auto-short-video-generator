import { createHash } from "node:crypto";
import type { Entity } from "../data/wikidata.ts";
import { getEntities } from "../data/wikidata.ts";
import type { SearchResult, StoryCandidate } from "../types.ts";
import { claimEntityIds, classifyEntityEvidence, classifyLocationFromText, classifyStoryTypeFromText, calculateMysteryPotential, type EntityClassification } from "./classification.ts";
import { createStoryStore, type StoryStore } from "./store.ts";

type Classified = { candidate: StoryCandidate; result: EntityClassification };
export type ReclassificationReport = {
  generatedAt: string; totalCandidates: number; malaysiaBefore: number; malaysiaAfter: number; confirmedMalaysia: number;
  probableMalaysia: number; unknownGeography: number; global: number; changedClassifications: number; metadataUpdated: number;
  entitiesLoaded: number; entityLoadFailures: number; preFixSample: SampleReport; correctedMalaysiaSample: SampleReport;
  validationRecords: Array<{ id: string; title: string; country: string; confidence: string; geographyEvidence: unknown[]; storyType: string; mysteryPotential: string }>;
};
type SampleReport = { sampleSize: number; truePositive: number; falsePositive: number; uncertain: number; precision: number | null; ids: string[] };

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function chunks<T>(values: T[], size: number) { return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, index * size + size)); }

async function loadBatches(ids: string[], graph: Map<string, Entity>, delayMs: number) {
  let failures = 0;
  for (const batch of chunks([...new Set(ids.filter((id) => !graph.has(id)))], 50)) {
    let loaded = false;
    for (let attempt = 0; attempt < 3 && !loaded; attempt += 1) {
      try {
        const entities = await getEntities(batch);
        for (const [id, entity] of Object.entries(entities)) if (!(entity as { missing?: string }).missing) graph.set(id, entity);
        loaded = true;
      } catch { if (attempt < 2) await sleep(1000 * (attempt + 1)); }
    }
    if (!loaded) failures += batch.length;
    if (delayMs) await sleep(delayMs);
  }
  return failures;
}

async function loadEntityGraph(rootIds: string[], delayMs = 300) {
  const graph = new Map<string, Entity>(); let failures = await loadBatches(rootIds, graph, delayMs);
  let frontier = rootIds;
  for (let depth = 0; depth < 4; depth += 1) {
    const relationProperties = depth === 0 ? undefined : ["P17", "P27", "P495", "P131", "P276", "P361", "P1269"];
    const references = [...new Set(frontier.flatMap((id) => claimEntityIds(graph.get(id), relationProperties)).filter((id) => !graph.has(id)))];
    if (!references.length) break;
    failures += await loadBatches(references, graph, delayMs); frontier = references;
  }
  return { graph, failures };
}

function fallbackClassification(candidate: StoryCandidate): EntityClassification {
  const item = { label: candidate.title, description: candidate.summary };
  const geography = classifyLocationFromText(item);
  return { ...geography, storyType: classifyStoryTypeFromText(item), storyTypeEvidence: ["ENTITY_TEXT"], mysteryPotential: calculateMysteryPotential(item) };
}

function randomSample<T extends { candidate: StoryCandidate }>(values: T[], size: number, seed: string) {
  return [...values].sort((left, right) => createHash("sha256").update(`${seed}:${left.candidate.id}`).digest("hex").localeCompare(createHash("sha256").update(`${seed}:${right.candidate.id}`).digest("hex"))).slice(0, size);
}

function sampleReport(values: Classified[], ids: Set<string>): SampleReport {
  const sampled = values.filter(({ candidate }) => ids.has(candidate.id));
  let truePositive = 0; let falsePositive = 0; let uncertain = 0;
  for (const { result } of sampled) {
    if (result.country === "Malaysia" && ["HIGH", "MEDIUM"].includes(result.geographyConfidence)) truePositive += 1;
    else if (result.country === "Malaysia") uncertain += 1;
    else falsePositive += 1;
  }
  const measured = truePositive + falsePositive;
  return { sampleSize: sampled.length, truePositive, falsePositive, uncertain, precision: measured ? Number((truePositive / measured).toFixed(4)) : null, ids: sampled.map(({ candidate }) => candidate.canonicalEntityId ?? candidate.id) };
}

export async function reclassifyStories(options: { store?: StoryStore; delayMs?: number; sampleSize?: number } = {}): Promise<ReclassificationReport> {
  const store = options.store ?? createStoryStore(); const ownsStore = !options.store; const sampleSize = Math.max(50, options.sampleSize ?? 50);
  try {
    await store.migrate(); const candidates = await store.listAll();
    const malaysiaBeforeCandidates = candidates.filter((candidate) => candidate.country === "Malaysia" || /Malaya/i.test(candidate.region));
    const seed = new Date().toISOString().slice(0, 10); const preSampleIds = new Set(randomSample(malaysiaBeforeCandidates.map((candidate) => ({ candidate })), sampleSize, `${seed}:before`).map(({ candidate }) => candidate.id));
    const rootIds = candidates.map((candidate) => candidate.canonicalEntityId).filter((id): id is string => Boolean(id));
    const { graph, failures } = await loadEntityGraph(rootIds, options.delayMs ?? 300);
    const classified: Classified[] = candidates.map((candidate) => {
      const entity = candidate.canonicalEntityId ? graph.get(candidate.canonicalEntityId) : undefined;
      const item: Pick<SearchResult, "label" | "description"> = { label: candidate.title, description: candidate.summary };
      return { candidate, result: entity ? classifyEntityEvidence(item, entity, graph) : fallbackClassification(candidate) };
    });
    let changedClassifications = 0;
    for (const { candidate, result } of classified) {
      if (candidate.country !== result.country || candidate.region !== result.region || candidate.storyType !== result.storyType) changedClassifications += 1;
      await store.updateClassification(candidate.id, { country: result.country, region: result.region, storyType: result.storyType,
        metadata: { ...candidate.metadata, geographyConfidence: result.geographyConfidence, geographyEvidence: result.geographyEvidence,
          mysteryPotential: result.mysteryPotential, storyTypeEvidence: result.storyTypeEvidence, classificationVersion: "2.1-entity-evidence" } });
    }
    const malaysia = classified.filter(({ result }) => result.country === "Malaysia");
    const confirmed = malaysia.filter(({ result }) => ["HIGH", "MEDIUM"].includes(result.geographyConfidence));
    const correctedIds = new Set(randomSample(confirmed, sampleSize, `${seed}:after`).map(({ candidate }) => candidate.id));
    const validationIds = new Set(["Q20465421", "Q5759146"]);
    return {
      generatedAt: new Date().toISOString(), totalCandidates: candidates.length, malaysiaBefore: malaysiaBeforeCandidates.length,
      malaysiaAfter: malaysia.length, confirmedMalaysia: confirmed.length, probableMalaysia: malaysia.length - confirmed.length,
      unknownGeography: classified.filter(({ result }) => result.geographyConfidence === "UNKNOWN").length,
      global: classified.filter(({ result }) => result.country !== "Malaysia" && result.geographyConfidence !== "UNKNOWN").length,
      changedClassifications, metadataUpdated: candidates.length, entitiesLoaded: graph.size, entityLoadFailures: failures,
      preFixSample: sampleReport(classified, preSampleIds), correctedMalaysiaSample: sampleReport(classified, correctedIds),
      validationRecords: classified.filter(({ candidate }) => validationIds.has(candidate.canonicalEntityId ?? "")).map(({ candidate, result }) => ({ id: candidate.canonicalEntityId!, title: candidate.title, country: result.country, confidence: result.geographyConfidence, geographyEvidence: result.geographyEvidence, storyType: result.storyType, mysteryPotential: result.mysteryPotential })),
    };
  } finally { if (ownsStore) await store.close(); }
}
