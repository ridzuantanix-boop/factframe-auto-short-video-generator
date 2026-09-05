import { createStoryStore, type StoryStore } from "../discovery/store.ts";
import type { StoryIndexStatus } from "../types.ts";
import { researchStoryCandidate } from "./storyResearch.ts";
import type { ResearchPackage } from "./types.ts";

export type ResearchBatchOptions = { status?: StoryIndexStatus | "ALL"; limit?: number; category?: string; region?: string; minSources?: number; concurrency?: number; delayMs?: number; store?: StoryStore };
const REQUIRED_TYPES = ["DISAPPEARANCE", "MYSTERIOUS_DEATH", "CRIME_MYSTERY", "DISASTER", "PARANORMAL_REPORT", "FOLKLORE", "HISTORICAL_INCIDENT"];

function diverseSelection<T extends { storyType: string }>(items: T[], limit: number) {
  const selected: T[] = []; const used = new Set<string>();
  for (const type of REQUIRED_TYPES) {
    const match = items.find((item) => item.storyType === type && !used.has(String((item as T & { id?: string }).id)));
    if (match) { selected.push(match); used.add(String((match as T & { id?: string }).id)); }
  }
  for (const item of items) {
    const id = String((item as T & { id?: string }).id); if (selected.length >= limit) break;
    if (!used.has(id)) { selected.push(item); used.add(id); }
  }
  return selected.slice(0, limit);
}

export async function enrichStoryBatch(options: ResearchBatchOptions = {}) {
  const store = options.store ?? createStoryStore(); const ownsStore = !options.store; await store.migrate();
  const limit = Math.min(500, Math.max(1, options.limit ?? 25)); const concurrency = Math.min(4, Math.max(1, options.concurrency ?? 2));
  const delayMs = Math.min(5000, Math.max(0, options.delayMs ?? 100));
  const available = await store.listResearchCandidates({ status: options.status ?? "PARTIAL", limit: 500, category: options.category, region: options.region, minSources: options.minSources ?? 1 });
  const candidates = diverseSelection(available, limit); let cursor = 0; const packages: ResearchPackage[] = []; const failures: Array<{ candidateId: string; error: string }> = [];
  let rawClaimsExtracted = 0; let claimsMerged = 0;
  async function worker() {
    while (cursor < candidates.length) {
      const candidate = candidates[cursor++];
      try {
        const result = await researchStoryCandidate(candidate.id, store); packages.push(result.researchPackage);
        rawClaimsExtracted += result.rawClaimsExtracted; claimsMerged += result.mergedClaimCount;
      } catch (error) { failures.push({ candidateId: candidate.id, error: error instanceof Error ? error.message : "unknown error" }); }
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    const totalClaims = packages.reduce((sum, item) => sum + item.claims.length, 0); const ready = packages.filter((item) => item.readyDecision.status === "READY").length;
    return { generatedAt: new Date().toISOString(), candidatesRequested: limit, candidatesProcessed: packages.length, rawClaimsExtracted,
      totalClaims, claimsMerged, averageClaimsPerStory: packages.length ? Number((totalClaims / packages.length).toFixed(3)) : 0,
      storiesPromotedReady: ready, storiesKeptPartial: packages.length - ready,
      averageSourceCoverage: packages.length ? Number((packages.reduce((sum, item) => sum + item.sourceCoverage, 0) / packages.length).toFixed(3)) : 0,
      unsupportedClaims: packages.reduce((sum, item) => sum + item.unsupportedClaimCount, 0), failures, candidateIds: packages.map((item) => item.storyCandidateId) };
  } finally { if (ownsStore) await store.close(); }
}
