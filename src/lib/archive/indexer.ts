import { createHash, randomUUID } from "node:crypto";
import type { StoryCandidateInput } from "../types.ts";
import { canonicalizeUrl, normalizeTitle, slugify } from "../discovery/normalizer.ts";
import { createStoryStore, type StoryStore } from "../discovery/store.ts";
import { clusterArchiveEvents } from "./clustering.ts";
import { extractArchiveEvent } from "./extractor.ts";
import { ARCHIVE_PROVIDERS } from "./providers/index.ts";
import { ARCHIVE_QUERY_GROUPS, archiveQueries } from "./queryBank.ts";
import type { ArchiveCluster, } from "./clustering.ts";
import type { ArchiveDocument, DiscoveryProvider, ExtractedArchiveEvent } from "./types.ts";

export type ArchiveIngestionOptions = { provider?: string; region?: string; queryGroup?: string; pages?: number; limit?: number; delayMs?: number; concurrency?: number; store?: StoryStore; providerRegistry?: Record<string, DiscoveryProvider<unknown>> };
export type ArchiveIngestionReport = {
  generatedAt: string; providersAttempted: string[]; queriesRun: number; rawDocuments: number; normalizedDocuments: number; extractedEvents: number;
  clusters: number; newCandidates: number; updatedCandidates: number; malaysiaMalayaCandidates: number; duplicateMerges: number;
  sourcesInserted: number; sourcesDeduped: number; providerFailures: Record<string, number>; errors: string[];
  sourceCountDistribution: Record<string, number>; candidatesWithTwoPlusSources: number; candidatesWithThreePlusSources: number;
  discovered: number; partial: number; ready: number; totalCatalog: number;
};

function providerTasks(providerIds: string[], options: ArchiveIngestionOptions) {
  const allQueries = archiveQueries(options.queryGroup, options.region);
  return providerIds.flatMap((providerId) => {
    const queries = options.provider ? allQueries
      : providerId === "newspapersg" ? allQueries
        : providerId === "nlb_records" ? (options.queryGroup ? allQueries : ARCHIVE_QUERY_GROUPS.historical)
          : providerId === "nlb_audiovisual" ? (options.queryGroup ? allQueries : ARCHIVE_QUERY_GROUPS.historical.slice(0, 6))
            : [options.region ? `${options.region} history` : "Malaya historical incident"];
    return queries.flatMap((query) => Array.from({ length: options.pages ?? 1 }, (_, index) => ({ providerId, query, page: index + 1 })));
  });
}

function clusterCandidate(cluster: ArchiveCluster, queryByUrl: Map<string, string>): StoryCandidateInput {
  const representative = [...cluster.events].sort((a, b) => b.document.title.length - a.document.title.length)[0];
  const documents = [...new Map(cluster.events.map((event) => [event.document.url, event.document])).values()];
  const locations = [...new Set(cluster.events.flatMap((event) => event.locations))];
  const providers = [...new Set(documents.map((document) => document.provider))];
  const claims = [...new Map(cluster.events.map((event) => [normalizeTitle(event.claim), { text: event.claim, status: event.claimStatus, sourceUrl: event.document.url }])).values()];
  const specificLocation = locations.find((location) => location !== "Malaysia / Malaya") ?? locations[0] ?? "Malaysia / Malaya";
  const title = representative.document.title.trim(); const now = new Date().toISOString();
  return {
    id: randomUUID(), canonicalEntityId: null, canonicalUrl: canonicalizeUrl(representative.document.url), title,
    normalizedTitle: normalizeTitle(title), slug: slugify(title), summary: representative.document.snippet || `Archival report published by ${representative.document.publisher}.`,
    country: "Malaysia", region: specificLocation, category: "archive", storyType: representative.incidentType, status: "DISCOVERED",
    sourceCount: documents.length, claimCount: claims.length, researchScore: null, visualScore: null, narrativePotentialScore: null,
    sourceHints: documents.map((document) => document.url), searchTerms: [...new Set([title, ...locations, ...representative.people])], aliases: [],
    metadata: { categories: ["archive"], archiveDerived: true, archiveClusterKey: cluster.key, originProviders: providers,
      historicalContext: representative.historicalContext, historicalContextEvidence: representative.historicalContextEvidence,
      geographyConfidence: specificLocation === "Malaysia / Malaya" ? "LOW" : "MEDIUM",
      geographyEvidence: locations.map((location) => ({ type: "ARCHIVE_EXTRACTED_LOCATION", value: location })),
      classificationVersion: "3.1-archive-scored", mysteryPotential: ["PARANORMAL_REPORT", "UNEXPLAINED_EVENT", "CRIME_MYSTERY", "MYSTERIOUS_DEATH", "DISAPPEARANCE"].includes(representative.incidentType) ? "HIGH" : "MEDIUM",
      storyTypeConfidence: representative.storyTypeConfidence, storyTypeEvidence: representative.storyTypeEvidence,
      claimStatus: representative.claimStatus, claims, originalLocationTerms: [...new Set(cluster.events.flatMap((event) => event.originalLocations))] },
    discoveredAt: now, updatedAt: now, lastResearchedAt: null, lastVerifiedAt: null,
    originProvider: representative.document.provider, originQuery: queryByUrl.get(representative.document.url) ?? "archive discovery",
  };
}

function sourceId(document: ArchiveDocument) { return createHash("sha256").update(`${document.provider}:${document.url}`).digest("hex").slice(0, 32); }

export async function runArchiveIngestion(options: ArchiveIngestionOptions = {}): Promise<ArchiveIngestionReport> {
  const store = options.store ?? createStoryStore(); const ownsStore = !options.store;
  const pages = Math.min(5, Math.max(1, options.pages ?? 1)); const limit = Math.min(50, Math.max(1, options.limit ?? 15));
  const delayMs = Math.min(5000, Math.max(0, options.delayMs ?? 250)); const concurrency = Math.min(4, Math.max(1, options.concurrency ?? 2));
  const registry = options.providerRegistry ?? ARCHIVE_PROVIDERS as Record<string, DiscoveryProvider<unknown>>;
  const selected = options.provider ? [options.provider] : Object.keys(registry);
  for (const provider of selected) if (!registry[provider]) throw new Error(`Unknown archive provider: ${provider}`);
  const normalizedOptions = { ...options, pages }; const tasks = providerTasks(selected, normalizedOptions); const documents: ArchiveDocument[] = [];
  const queryByUrl = new Map<string, string>(); const providerFailures: Record<string, number> = {}; const errors: string[] = [];
  let rawDocuments = 0; let queriesRun = 0; let cursor = 0;
  await store.migrate(); const catalogBefore = await store.stats();
  async function worker() {
    while (cursor < tasks.length) {
      const task = tasks[cursor++]; const provider = registry[task.providerId]; queriesRun += 1;
      try {
        const response = await provider.search(task.query, { page: task.page, limit, timeoutMs: 15_000 }); rawDocuments += response.results.length;
        for (const raw of response.results) {
          const document = provider.normalize(raw); if (!document) continue;
          documents.push(document); queryByUrl.set(document.url, task.query);
        }
      } catch (error) {
        providerFailures[provider.id] = (providerFailures[provider.id] ?? 0) + 1;
        errors.push(`${provider.id}/${task.query}/page-${task.page}: ${error instanceof Error ? error.message : "unknown error"}`);
      }
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    const uniqueDocuments = [...new Map(documents.map((document) => [`${document.provider}:${document.url}`, document])).values()];
    const events = uniqueDocuments.map(extractArchiveEvent).filter((event): event is ExtractedArchiveEvent => Boolean(event));
    const clustered = clusterArchiveEvents(events); let newCandidates = 0; let updatedCandidates = 0; let sourcesInserted = 0; let sourcesDeduped = 0;
    for (const cluster of clustered.clusters) {
      const candidate = clusterCandidate(cluster, queryByUrl); const existing = await store.findByArchiveCluster(cluster.key) ?? await store.findByIdentity(candidate);
      const saved = await store.upsert(existing ? { ...candidate, id: existing.id } : candidate); if (existing) updatedCandidates += 1; else newCandidates += 1;
      for (const event of cluster.events) {
        const document = event.document; const source = await store.upsertSource({ id: sourceId(document), storyCandidateId: saved.id, provider: document.provider,
          sourceType: document.sourceType, title: document.title, publisher: document.publisher, url: document.url, publishedAt: document.publishedAt,
          accessedAt: document.accessedAt, snippet: document.snippet, metadata: { ...document.metadata, extractedLocations: event.locations,
            extractedPeople: event.people, eventVerbs: event.eventVerbs, incidentType: event.incidentType, claimStatus: event.claimStatus }, reliabilityLevel: document.reliabilityLevel });
        if (source.inserted) sourcesInserted += 1; else sourcesDeduped += 1;
      }
      await store.refreshSourceMetrics(saved.id);
    }
    const archive = await store.archiveStats(); const after = await store.stats();
    return { generatedAt: new Date().toISOString(), providersAttempted: selected.map((id) => registry[id].id), queriesRun, rawDocuments,
      normalizedDocuments: uniqueDocuments.length, extractedEvents: events.length, clusters: clustered.clusters.length, newCandidates,
      updatedCandidates, malaysiaMalayaCandidates: archive.malaysiaArchiveCandidates, duplicateMerges: clustered.duplicateMerges,
      sourcesInserted, sourcesDeduped, providerFailures, errors, sourceCountDistribution: archive.sourceCountDistribution,
      candidatesWithTwoPlusSources: archive.twoPlusSources, candidatesWithThreePlusSources: archive.threePlusSources,
      discovered: archive.discovered, partial: archive.partial, ready: archive.ready, totalCatalog: after.total || catalogBefore.total };
  } finally { if (ownsStore) await store.close(); }
}
