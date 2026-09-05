import type { ArchiveReliability, StoredStorySource } from "../archive/types.ts";
import { createStoryStore, type StoryStore } from "../discovery/store.ts";
import type { CaseStatus, ResearchSource, StoryCategory, StoryRecord } from "../types.ts";
import { extractClaimsFromSources } from "./claimExtractor.ts";
import { mergeDuplicateClaims } from "./claimMerger.ts";
import { calculateResearchMetrics, decideResearchReadiness } from "./researchScoring.ts";
import type { GroundedNarrativeElement, ResearchClaim, ResearchPackage } from "./types.ts";

function sourceRole(value: ArchiveReliability) {
  if (["PRIMARY", "OFFICIAL"].includes(value)) return "PRIMARY_OFFICIAL" as const;
  if (value === "ARCHIVAL_NEWSPAPER") return "ARCHIVAL_NEWSPAPER" as const;
  if (["INSTITUTIONAL", "ACADEMIC"].includes(value)) return "INSTITUTIONAL" as const;
  return "REFERENCE" as const;
}

function sourceType(value: ArchiveReliability): ResearchSource["type"] {
  if (value === "PRIMARY" || value === "OFFICIAL") return "PRIMARY";
  if (value === "INSTITUTIONAL") return "INSTITUTIONAL";
  if (value === "ACADEMIC") return "ACADEMIC";
  if (value === "ARCHIVAL_NEWSPAPER") return "ARCHIVAL";
  return value === "REFERENCE" ? "REFERENCE" : "SECONDARY";
}

function researchSources(sources: StoredStorySource[]): ResearchPackage["sources"] {
  return sources.map((source) => ({ id: source.id, title: source.title, publisher: source.publisher, type: sourceType(source.reliabilityLevel),
    url: source.url, date: source.publishedAt ?? undefined, accessedAt: source.accessedAt, reliabilityLevel: sourceType(source.reliabilityLevel),
    sourceRole: sourceRole(source.reliabilityLevel) }));
}

function questionFor(storyType: string) {
  if (storyType === "DISAPPEARANCE") return "Apakah yang berlaku selepas kehilangan itu dilaporkan?";
  if (storyType === "MYSTERIOUS_DEATH") return "Apakah yang dapat dipastikan daripada penemuan itu?";
  if (storyType === "CRIME_MYSTERY") return "Bagaimanakah laporan dan tindakan pihak berkuasa menyusun kes ini?";
  if (storyType === "DISASTER") return "Apakah urutan kejadian yang membawa kepada bencana itu?";
  if (storyType === "PARANORMAL_REPORT") return "Apakah yang benar-benar dilaporkan, dan apakah yang belum dapat disahkan?";
  if (storyType === "FOLKLORE") return "Bahagian manakah direkodkan, dan bahagian manakah kekal sebagai cerita rakyat?";
  return "Apakah yang berubah apabila rekod-rekod ini disusun mengikut masa?";
}

function hookFor(claim: ResearchClaim, index: number): GroundedNarrativeElement {
  const leads = ["Rekod arkib membuka cerita ini dengan satu butiran penting:", "Satu laporan lama merekodkan:", "Petunjuk paling jelas dalam sumber ialah:"];
  return { text: `${leads[index % leads.length]} ${claim.claimText}`, claimIds: [claim.id], sourceIds: claim.sourceIds };
}

function assignNarrativePriorities(claims: ResearchClaim[]) {
  return claims.map((claim, index) => ({ ...claim, priority: index === 0 ? "HOOK_WORTHY" as const : index === claims.length - 1 ? "PAYOFF" as const
    : index === 1 ? "ESSENTIAL_CONTEXT" as const : index === Math.max(2, claims.length - 2) ? "TWIST" as const : "ESCALATION_DETAIL" as const }));
}

function needsCurrentVerification(storyType: string, historicalContext: string, sources: StoredStorySource[]) {
  if (historicalContext !== "MODERN_MALAYSIA" || !["DISAPPEARANCE", "CRIME_MYSTERY", "UNEXPLAINED_EVENT"].includes(storyType)) return false;
  const latest = sources.map((source) => source.publishedAt ? Date.parse(source.publishedAt) : 0).reduce((max, value) => Math.max(max, value), 0);
  return latest > Date.parse("2015-01-01T00:00:00.000Z");
}

function sourcesAreTemporallyCoherent(sources: StoredStorySource[]) {
  const dates = sources.map((source) => source.publishedAt ? Date.parse(source.publishedAt) : Number.NaN).filter(Number.isFinite);
  if (dates.length < 2) return true;
  return Math.max(...dates) - Math.min(...dates) <= 3 * 366 * 24 * 60 * 60 * 1000;
}

function normalizeLocation(value: string) {
  return value.replace(/\bJohore\b/gi, "Johor").replace(/\bMalacca\b/gi, "Melaka").replace(/\s+/g, " ").trim();
}

export async function researchStoryCandidate(candidateId: string, store: StoryStore = createStoryStore()) {
  const candidate = await store.findById(candidateId); if (!candidate) throw new Error(`Story candidate not found: ${candidateId}`);
  if (candidate.metadata.archiveDerived !== true) throw new Error("Only archive-derived candidates are supported by deterministic Phase 4 enrichment.");
  const sources = await store.listSourcesForCandidate(candidate.id); const rawClaims = extractClaimsFromSources(candidate, sources);
  const merged = mergeDuplicateClaims(rawClaims); const claims = assignNarrativePriorities(merged.claims);
  const historicalContext = String(candidate.metadata.historicalContext ?? "PRE_MALAYSIA");
  const requiresCurrentVerification = needsCurrentVerification(candidate.storyType, historicalContext, sources);
  const metrics = calculateResearchMetrics(claims, sources, candidate.storyType);
  const hooks = claims.slice(0, Math.min(3, claims.length)).map(hookFor);
  const keyTurningPoints = claims.filter((claim) => ["TWIST", "PAYOFF"].includes(claim.priority)).map((claim) => ({ text: claim.claimText, claimIds: [claim.id], sourceIds: claim.sourceIds }));
  const unresolvedQuestions = ["DISAPPEARANCE", "MYSTERIOUS_DEATH", "PARANORMAL_REPORT", "FOLKLORE", "UNEXPLAINED_EVENT", "CRIME_MYSTERY"].includes(candidate.storyType)
    ? [{ text: questionFor(candidate.storyType), claimIds: [], sourceIds: [] }] : [];
  const endingClaim = claims.at(-1); const payoff = endingClaim ? { text: endingClaim.claimText, claimIds: [endingClaim.id], sourceIds: endingClaim.sourceIds } : { text: "", claimIds: [], sourceIds: [] };
  const readyDecision = decideResearchReadiness(claims, sources, metrics, Boolean(hooks.length), Boolean(payoff.text), requiresCurrentVerification, sourcesAreTemporallyCoherent(sources));
  const now = new Date().toISOString(); const packageValue: ResearchPackage = {
    storyCandidateId: candidate.id, title: candidate.title, summary: candidate.summary, storyType: candidate.storyType, historicalContext,
    sources: researchSources(sources), claims, timeline: claims.map((claim) => ({ id: `timeline-${claim.id}`, date: claim.eventDate,
      dateBasis: claim.eventDate ? "PUBLICATION_DATE" : "UNKNOWN", text: claim.claimText, claimIds: [claim.id], sourceIds: claim.sourceIds, confidence: claim.confidence })),
    people: [...new Set(claims.flatMap((claim) => claim.people).map((item) => item.trim()).filter(Boolean))],
    locations: [...new Set([candidate.region, ...claims.flatMap((claim) => claim.locations)].filter(Boolean).map(normalizeLocation))],
    hookCandidates: hooks, keyTurningPoints, unresolvedQuestions, payoff, ...metrics, readyDecision, requiresCurrentVerification,
    lastResearchedAt: now, lastVerifiedAt: now,
  };
  await store.persistResearchPackage(candidate, claims, packageValue);
  return { researchPackage: packageValue, rawClaimsExtracted: rawClaims.length, mergedClaimCount: merged.mergedClaimCount };
}

function storyCategory(storyType: string): StoryCategory {
  const mapping: Record<string, StoryCategory> = { DISAPPEARANCE: "DISAPPEARANCE", CRIME_MYSTERY: "CRIME_MYSTERY", STRANGE_EVENT: "STRANGE_EVENT",
    PARANORMAL_REPORT: "PARANORMAL_CLAIM", FOLKLORE: "URBAN_LEGEND", UNEXPLAINED_EVENT: "UNEXPLAINED_PHENOMENON" };
  return mapping[storyType] ?? "HISTORICAL_MYSTERY";
}

function caseStatus(storyType: string, claims: ResearchClaim[]): CaseStatus {
  if (storyType === "FOLKLORE") return "LEGEND";
  if (claims.some((claim) => claim.claimType === "EXPLAINED_LATER")) return "PARTIALLY_EXPLAINED";
  if (["DISAPPEARANCE", "MYSTERIOUS_DEATH", "UNEXPLAINED_EVENT"].includes(storyType)) return "UNSOLVED";
  if (storyType === "PARANORMAL_REPORT") return "REPORTED_CLAIM";
  return "PARTIALLY_EXPLAINED";
}

export function researchPackageToStoryRecord(value: ResearchPackage): StoryRecord {
  const year = Number(value.timeline.map((item) => item.date?.slice(0, 4)).find(Boolean) ?? new Date().getFullYear());
  return { id: value.storyCandidateId, title: value.title, country: "Malaysia", region: value.locations[0] ?? "Malaysia / Malaya", year,
    decade: `${Math.floor(year / 10) * 10}-an`, category: storyCategory(value.storyType), caseStatus: caseStatus(value.storyType, value.claims),
    summary: value.summary, entityIds: [], sourceHints: value.sources.map((source) => source.publisher),
    visualSearchTerms: [...new Set([value.title, ...value.locations, ...value.people])].slice(0, 8), researchScore: value.researchScore,
    visualScore: 0, sourceCoveragePotential: value.sourceCoverage === 1 ? "good" : "limited", sources: value.sources,
    claims: value.claims.map((claim) => ({ id: claim.id, claim: claim.claimText, narration: claim.claimText, type: claim.claimType,
      confidence: claim.confidence, sourceIds: claim.sourceIds, priority: claim.priority, visualIntent: claim.visualIntent })),
    historicalContext: value.historicalContext, timeline: value.timeline, hookCandidates: value.hookCandidates,
    unresolvedQuestions: value.unresolvedQuestions, payoff: value.payoff };
}

export async function loadResearchStory(candidateId: string, store: StoryStore = createStoryStore()) {
  await store.migrate(); const value = await store.getResearchPackage(candidateId);
  return value?.readyDecision.status === "READY" ? researchPackageToStoryRecord(value) : null;
}
