import type { StoryCandidate, StoryCandidateInput } from "@/lib/types";
import { mergeStringValues } from "./normalizer.ts";

export function dedupeKey(candidate: Pick<StoryCandidateInput, "canonicalEntityId" | "canonicalUrl" | "normalizedTitle">) {
  return candidate.canonicalEntityId ?? candidate.canonicalUrl ?? candidate.normalizedTitle;
}

export function mergeCandidates(existing: StoryCandidate, incoming: StoryCandidateInput): StoryCandidateInput {
  const categories = mergeStringValues(existing.metadata.categories as string[] | undefined, incoming.metadata.categories as string[] | undefined, [existing.category, incoming.category]);
  const entityClassified = existing.metadata.classificationVersion === "2.1-entity-evidence";
  const preservedClassification = entityClassified ? {
    geographyConfidence: existing.metadata.geographyConfidence, geographyEvidence: existing.metadata.geographyEvidence,
    mysteryPotential: existing.metadata.mysteryPotential, storyTypeEvidence: existing.metadata.storyTypeEvidence,
    classificationVersion: existing.metadata.classificationVersion,
  } : {};
  const statusRank = { DISCOVERED: 0, PARTIAL: 1, READY: 2 } as const;
  const status = existing.status === "HIDDEN" || incoming.status === "HIDDEN" ? "HIDDEN"
    : statusRank[incoming.status] > statusRank[existing.status] ? incoming.status : existing.status;
  return {
    ...incoming, id: existing.id, canonicalEntityId: existing.canonicalEntityId ?? incoming.canonicalEntityId,
    canonicalUrl: existing.canonicalUrl ?? incoming.canonicalUrl,
    title: incoming.title.length > existing.title.length ? incoming.title : existing.title,
    normalizedTitle: existing.normalizedTitle, slug: existing.slug,
    summary: incoming.summary.length > existing.summary.length ? incoming.summary : existing.summary,
    category: existing.category === "interesting" ? incoming.category : existing.category,
    country: entityClassified ? existing.country : existing.country === "Unknown" ? incoming.country : existing.country,
    region: entityClassified ? existing.region : existing.region === "Unknown" ? incoming.region : existing.region,
    storyType: entityClassified ? existing.storyType : existing.storyType === "EXPLAINER" ? incoming.storyType : existing.storyType,
    status, sourceCount: Math.max(existing.sourceCount, incoming.sourceCount),
    claimCount: Math.max(existing.claimCount, incoming.claimCount), researchScore: incoming.researchScore ?? existing.researchScore,
    visualScore: incoming.visualScore ?? existing.visualScore,
    narrativePotentialScore: incoming.narrativePotentialScore ?? existing.narrativePotentialScore,
    sourceHints: mergeStringValues(existing.sourceHints, incoming.sourceHints),
    searchTerms: mergeStringValues(existing.searchTerms, incoming.searchTerms),
    aliases: mergeStringValues(existing.aliases, incoming.aliases, existing.title !== incoming.title ? [incoming.title] : []),
    metadata: { ...existing.metadata, ...incoming.metadata, categories, ...preservedClassification },
    discoveredAt: existing.discoveredAt, lastResearchedAt: incoming.lastResearchedAt ?? existing.lastResearchedAt,
    lastVerifiedAt: incoming.lastVerifiedAt ?? existing.lastVerifiedAt,
    originProvider: existing.originProvider, originQuery: existing.originQuery,
  };
}
