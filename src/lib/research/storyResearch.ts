import type { ArchiveReliability, StoredStorySource } from "../archive/types.ts";
import { createStoryStore, type StoryStore } from "../discovery/store.ts";
import type { CaseStatus, ResearchSource, StoryCategory, StoryRecord } from "../types.ts";
import { extractClaimsFromSources } from "./claimExtractor.ts";
import { mergeDuplicateClaims } from "./claimMerger.ts";
import { calculateResearchMetrics, decideResearchReadiness } from "./researchScoring.ts";
import type { AiNarration, GroundedNarrativeElement, ResearchClaim, ResearchPackage } from "./types.ts";
import { rewriteClaimsForSpeech, assessNarrationQuality } from "./narrationRewriter.ts";
import { validateSourceCluster } from "../archive/clusterIntegrity.ts";
import { validateClaimRewrite } from "./aiClaimValidator.ts";

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

function questionFor(storyType: string, claim: ResearchClaim) {
  const text = claim.spokenText.toLowerCase();
  if (text.includes("jurumudi")) return "Apakah yang berlaku kepada jurumudi yang masih hilang itu?";
  if (storyType === "DISAPPEARANCE") return "Apakah yang berlaku kepada individu yang dilaporkan hilang itu?";
  if (storyType === "MYSTERIOUS_DEATH") return "Apakah yang dapat dipastikan selepas mayat itu ditemukan?";
  if (storyType === "CRIME_MYSTERY") return "Apakah perkembangan siasatan selepas laporan jenayah itu?";
  if (storyType === "DISASTER") return "Bagaimanakah kejadian itu berkembang sehingga mengorbankan mangsa?";
  if (storyType === "PARANORMAL_REPORT") return "Apakah sebenarnya yang didakwa oleh para saksi dalam laporan itu?";
  if (storyType === "FOLKLORE") return "Apakah yang direkodkan oleh sumber tentang legenda tempatan itu?";
  return "Apakah perkembangan seterusnya yang direkodkan dalam sumber?";
}

function hookFor(claim: ResearchClaim): GroundedNarrativeElement {
  return { text: claim.spokenText, claimIds: [claim.id], sourceIds: claim.sourceIds };
}

function assignNarrativePriorities(claims: ResearchClaim[]) {
  const speakable = claims.filter((claim) => Boolean(claim.spokenText));
  const positions = new Map(speakable.map((claim, index) => [claim.id, index]));
  return claims.map((claim) => { const index = positions.get(claim.id); const total = speakable.length;
    return { ...claim, priority: index === undefined ? "LOW_PRIORITY" as const : index === 0 ? "HOOK_WORTHY" as const : index === total - 1 ? "PAYOFF" as const
      : index === 1 ? "ESSENTIAL_CONTEXT" as const : index === Math.max(2, total - 2) ? "TWIST" as const : "ESCALATION_DETAIL" as const }; });
}

function needsCurrentVerification(storyType: string, historicalContext: string, sources: StoredStorySource[]) {
  if (historicalContext !== "MODERN_MALAYSIA" || !["DISAPPEARANCE", "CRIME_MYSTERY", "UNEXPLAINED_EVENT"].includes(storyType)) return false;
  const latest = sources.map((source) => source.publishedAt ? Date.parse(source.publishedAt) : 0).reduce((max, value) => Math.max(max, value), 0);
  return latest > Date.parse("2015-01-01T00:00:00.000Z");
}

function normalizeLocation(value: string) {
  return value.replace(/\bJohore\b/gi, "Johor").replace(/\bMalacca\b/gi, "Melaka").replace(/\s+/g, " ").trim();
}

export async function researchStoryCandidate(candidateId: string, store: StoryStore = createStoryStore()) {
  const candidate = await store.findById(candidateId); if (!candidate) throw new Error(`Story candidate not found: ${candidateId}`);
  if (candidate.metadata.archiveDerived !== true) throw new Error("Only archive-derived candidates are supported by deterministic Phase 4 enrichment.");
  const prior = await store.getResearchPackage(candidate.id);
  const sources = await store.listSourcesForCandidate(candidate.id); const rawClaims = extractClaimsFromSources(candidate, sources);
  const merged = mergeDuplicateClaims(rawClaims); const deterministic = rewriteClaimsForSpeech(merged.claims, candidate.storyType); const priorByNormalized = new Map(prior?.claims.map((claim) => [claim.normalizedClaim, claim]) ?? []);
  const claims = deterministic.map((claim) => { if (claim.spokenText) return claim; const previous = priorByNormalized.get(claim.normalizedClaim); if (!previous?.spokenText) return claim;
    const validation = validateClaimRewrite(claim, { claimId: claim.id, spokenText: previous.spokenText, preservedClaimType: claim.claimType, preservedSourceIds: claim.sourceIds });
    return validation.valid ? { ...claim, spokenText: previous.spokenText, rewriteMethod: previous.rewriteMethod, rewriteModel: previous.rewriteModel,
      validatedAt: validation.checkedAt, validationVersion: validation.version, validationResult: validation } : claim; });
  const packageValue = await persistResearchClaims(candidate, sources, claims, store);
  return { researchPackage: packageValue, rawClaimsExtracted: rawClaims.length, mergedClaimCount: merged.mergedClaimCount };
}

export async function persistResearchClaims(candidate: Awaited<ReturnType<StoryStore["findById"]>> & {}, sources: StoredStorySource[], inputClaims: ResearchClaim[], store: StoryStore, aiNarration?: AiNarration) {
  const claims = assignNarrativePriorities(inputClaims);
  const historicalContext = String(candidate.metadata.historicalContext ?? "PRE_MALAYSIA");
  const requiresCurrentVerification = needsCurrentVerification(candidate.storyType, historicalContext, sources);
  const metrics = calculateResearchMetrics(claims, sources, candidate.storyType);
  const speakableClaims = claims.filter((claim) => Boolean(claim.spokenText)); const hooks = speakableClaims.slice(0, Math.min(3, speakableClaims.length)).map(hookFor);
  const sinking = speakableClaims.find((claim) => /kapal karam/i.test(claim.spokenText));
  const missingHelmsman = speakableClaims.find((claim) => /jurumudi.*hilang|hilang.*jurumudi/i.test(claim.spokenText));
  if (sinking && missingHelmsman) hooks.unshift({ text: sinking.spokenText.replace(/Namun, seorang masih hilang\.$/i, "Tetapi jurumudinya masih hilang."),
    claimIds: [sinking.id, missingHelmsman.id], sourceIds: [...new Set([...sinking.sourceIds, ...missingHelmsman.sourceIds])] });
  const keyTurningPoints = speakableClaims.filter((claim) => ["TWIST", "PAYOFF"].includes(claim.priority)).map((claim) => ({ text: claim.spokenText, claimIds: [claim.id], sourceIds: claim.sourceIds }));
  const unresolvedQuestions = (["DISAPPEARANCE", "MYSTERIOUS_DEATH", "PARANORMAL_REPORT", "FOLKLORE", "UNEXPLAINED_EVENT", "CRIME_MYSTERY"].includes(candidate.storyType) || /missing|hilang/i.test(candidate.title))
    ? speakableClaims[0] ? [{ text: /helmsman|jurumudi/i.test(candidate.title) ? "Apakah yang ditemukan apabila operasi mencari jurumudi itu diteruskan?" : questionFor(candidate.storyType, speakableClaims[0]), claimIds: [], sourceIds: [] }] : [] : [];
  const endingClaim = speakableClaims.at(-1); const payoff = endingClaim ? { text: endingClaim.spokenText, claimIds: [endingClaim.id], sourceIds: endingClaim.sourceIds } : { text: "", claimIds: [], sourceIds: [] };
  const cluster = validateSourceCluster(sources); const narrationQuality = assessNarrationQuality(claims);
  const readyDecision = decideResearchReadiness(claims, sources, metrics, Boolean(hooks.length), Boolean(payoff.text), requiresCurrentVerification, cluster.confidence, narrationQuality);
  if (claims.some((claim) => claim.rewriteMethod === "GEMINI") && !aiNarration) {
    readyDecision.status = "PARTIAL"; readyDecision.reasons = [...readyDecision.reasons.filter((reason) => !reason.startsWith("All research")), "Validated AI story narration is required after Gemini claim rewriting."];
  }
  const now = new Date().toISOString(); const packageValue: ResearchPackage = {
    storyCandidateId: candidate.id, title: candidate.title, summary: candidate.summary, storyType: candidate.storyType, historicalContext,
    sources: researchSources(sources), claims, timeline: speakableClaims.map((claim) => ({ id: `timeline-${claim.id}`, date: claim.eventDate,
      dateBasis: claim.eventDate ? "PUBLICATION_DATE" : "UNKNOWN", text: claim.spokenText, claimIds: [claim.id], sourceIds: claim.sourceIds, confidence: claim.confidence })),
    people: [...new Set(claims.flatMap((claim) => claim.people).map((item) => item.trim()).filter(Boolean))],
    locations: [...new Set([candidate.region, ...claims.flatMap((claim) => claim.locations)].filter(Boolean).map(normalizeLocation))],
    hookCandidates: hooks, keyTurningPoints, unresolvedQuestions, payoff, clusterConfidence: cluster.confidence, narrationQuality, aiNarration, ...metrics, readyDecision, requiresCurrentVerification,
    lastResearchedAt: now, lastVerifiedAt: now,
  };
  await store.persistResearchPackage(candidate, claims, packageValue);
  return packageValue;
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
    claims: value.claims.filter((claim) => Boolean(claim.spokenText)).map((claim) => ({ id: claim.id, claim: claim.claimText, narration: claim.spokenText, type: claim.claimType,
      confidence: claim.confidence, sourceIds: claim.sourceIds, priority: claim.priority, visualIntent: claim.visualIntent })),
    historicalContext: value.historicalContext, timeline: value.timeline, hookCandidates: value.hookCandidates,
    unresolvedQuestions: value.unresolvedQuestions, payoff: value.payoff, aiNarration: value.aiNarration };
}

export async function loadResearchStory(candidateId: string, store: StoryStore = createStoryStore()) {
  await store.migrate(); const value = await store.getResearchPackage(candidateId);
  return value?.readyDecision.status === "READY" ? researchPackageToStoryRecord(value) : null;
}
