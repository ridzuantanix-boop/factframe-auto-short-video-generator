import { randomUUID } from "node:crypto";
import { normalizeTitle, slugify } from "../discovery/normalizer.ts";
import { createStoryStore, type StoryStore } from "../discovery/store.ts";
import { validateSourceCluster } from "./clusterIntegrity.ts";

export async function repairCandidateClusters(candidateIds: string[], store: StoryStore = createStoryStore()) {
  await store.migrate();
  const candidates = await store.listResearchCandidatesByIds(candidateIds); const readyBefore = candidates.filter((item) => item.status === "READY").length;
  const resultCandidateIds: string[] = []; const details = []; let suspiciousClustersFound = 0; let candidatesSplit = 0; let newClustersCreated = 0; let sourcesReassigned = 0;
  const claimsBefore = candidates.reduce((sum, item) => sum + item.claimCount, 0);
  for (const candidate of candidates) {
    const sources = await store.listSourcesForCandidate(candidate.id); const validation = validateSourceCluster(sources);
    if (validation.clusters.length > 1) { suspiciousClustersFound += 1; candidatesSplit += 1; }
    const anchorIndex = Math.max(0, validation.clusters.findIndex((cluster) => cluster.sources.some((source) => source.url === candidate.canonicalUrl)));
    const ordered = validation.clusters.length ? [validation.clusters[anchorIndex], ...validation.clusters.filter((_, index) => index !== anchorIndex)] : [];
    const childIds: string[] = [];
    for (let index = 0; index < ordered.length; index += 1) {
      const cluster = ordered[index];
      if (index === 0) {
        await store.resetClusterResearch(candidate.id, { ...candidate.metadata, clusterConfidence: cluster.confidence, clusterRepairVersion: "4.1", clusterRepairParentId: candidate.id });
        childIds.push(candidate.id); resultCandidateIds.push(candidate.id); continue;
      }
      const representative = cluster.sources[0]; const date = representative.publishedAt?.slice(0, 10) ?? `undated-${index + 1}`;
      const title = `${representative.title} [${date}]`; const id = randomUUID();
      const created = await store.upsert({ ...candidate, id, canonicalEntityId: null, canonicalUrl: null, title,
        normalizedTitle: `${normalizeTitle(title)} ${id.slice(0, 8)}`, slug: `${slugify(title)}-${id.slice(0, 8)}`, summary: representative.snippet || candidate.summary,
        status: "PARTIAL", sourceCount: 0, claimCount: 0, researchScore: null, narrativePotentialScore: null,
        sourceHints: cluster.sources.map((source) => source.url), searchTerms: [...new Set([representative.title, candidate.region])], aliases: [],
        metadata: { ...candidate.metadata, categories: ["archive"], archiveClusterKey: `${candidate.metadata.archiveClusterKey ?? candidate.id}:repair:${index}`,
          clusterConfidence: cluster.confidence, clusterRepairVersion: "4.1", clusterRepairParentId: candidate.id },
        discoveredAt: candidate.discoveredAt, updatedAt: new Date().toISOString(), lastResearchedAt: null, lastVerifiedAt: null });
      const moved = await store.moveSources(cluster.sources.map((source) => source.id), created.id); sourcesReassigned += moved;
      await store.resetClusterResearch(created.id, created.metadata); childIds.push(created.id); resultCandidateIds.push(created.id); newClustersCreated += 1;
    }
    details.push({ originalCandidateId: candidate.id, title: candidate.title, sourceCountBefore: sources.length, resultingCandidateIds: childIds,
      resultingClusters: ordered.map((cluster) => ({ sourceCount: cluster.sources.length, confidence: cluster.confidence,
        dates: cluster.sources.map((source) => source.publishedAt?.slice(0, 10) ?? null), sourceIds: cluster.sources.map((source) => source.id) })) });
  }
  const after = await store.listResearchCandidatesByIds(resultCandidateIds);
  return { generatedAt: new Date().toISOString(), originalCandidateIds: candidates.map((item) => item.id), resultCandidateIds,
    originalCandidatesChecked: candidates.length, suspiciousClustersFound, candidatesSplit, newClustersCreated, sourcesReassigned,
    claimsBefore, readyBefore, readyImmediatelyAfter: after.filter((item) => item.status === "READY").length, details };
}
