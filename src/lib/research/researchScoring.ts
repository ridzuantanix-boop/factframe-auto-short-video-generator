import type { StoredStorySource } from "../archive/types.ts";
import type { ResearchClaim } from "./types.ts";
import type { ClusterConfidence } from "../archive/clusterIntegrity.ts";
import type { ResearchPackage } from "./types.ts";
import { calculateEvidenceDuration } from "./durationScoring.ts";

function actionKinds(value: string) {
  return [
    /miss|disappear|vanish|search/, /death|dead|died|kill|murder|body/, /police|arrest|court|trial|charg|sentence/,
    /ghost|haunt|spirit|apparition/, /flood|fire|collapse|crash|accident|explosion/, /report|claim|record|said/,
    /found|recover|return|explain|resolve/,
  ].filter((pattern) => pattern.test(value)).length;
}

export function calculateResearchMetrics(claims: ResearchClaim[], sources: StoredStorySource[], storyType: string, hasPayoff = true) {
  const validIds = new Set(sources.map((source) => source.id));
  const supported = claims.filter((claim) => claim.sourceIds.length && claim.sourceIds.every((id) => validIds.has(id)));
  const sourceCoverage = claims.length ? supported.length / claims.length : 0;
  const unsupportedClaimCount = claims.length - supported.length;
  const sourceDiversityScore = Math.min(1, new Set(sources.map((source) => `${source.provider}:${source.publisher}`)).size / 3);
  const claimKinds = claims.reduce((sum, claim) => sum + actionKinds(claim.normalizedClaim), 0);
  const claimDiversityScore = claims.length ? Math.min(1, claimKinds / Math.max(3, claims.length)) : 0;
  const ocrQualityScore = claims.length ? claims.reduce((sum, claim) => sum + claim.ocrQuality, 0) / claims.length : 0;
  const agreement = claims.length ? claims.reduce((sum, claim) => sum + (claim.confidence === "HIGH" ? 1 : claim.confidence === "MEDIUM" ? .7 : .3), 0) / claims.length : 0;
  const researchScore = Math.max(0, Math.min(1, sourceCoverage * .3 + agreement * .25 + sourceDiversityScore * .18 + claimDiversityScore * .17 + ocrQualityScore * .1));
  const storySignal = ["DISAPPEARANCE", "MYSTERIOUS_DEATH", "CRIME_MYSTERY", "DISASTER", "PARANORMAL_REPORT", "FOLKLORE", "UNEXPLAINED_EVENT"].includes(storyType) ? 1 : .65;
  const chronology = new Set(claims.map((claim) => claim.eventDate?.slice(0, 10)).filter(Boolean)).size >= 2 ? 1 : .55;
  const narrativePotentialScore = Math.max(0, Math.min(1, Math.min(1, claims.length / 6) * .32 + claimDiversityScore * .23 + storySignal * .22 + chronology * .13 + ocrQualityScore * .1));
  const duration = calculateEvidenceDuration(claims, storyType, hasPayoff);
  return { sourceCoverage: Number(sourceCoverage.toFixed(3)), unsupportedClaimCount, sourceDiversityScore: Number(sourceDiversityScore.toFixed(3)),
    claimDiversityScore: Number(claimDiversityScore.toFixed(3)), ocrQualityScore: Number(ocrQualityScore.toFixed(3)),
    researchScore: Number(researchScore.toFixed(3)), narrativePotentialScore: Number(narrativePotentialScore.toFixed(3)), ...duration };
}

export function decideResearchReadiness(claims: ResearchClaim[], sources: StoredStorySource[], metrics: ReturnType<typeof calculateResearchMetrics>, hasHook: boolean, hasPayoff: boolean,
  requiresCurrentVerification: boolean, clusterConfidence: ClusterConfidence = "LOW", narrationQuality?: ResearchPackage["narrationQuality"]) {
  const reasons: string[] = [];
  const usefulClaims = claims.filter((claim) => claim.confidence !== "LOW" && claim.ocrQuality >= .65 && Boolean(claim.spokenText));
  if (!usefulClaims.length) reasons.push("No clear, useful spoken factual claim.");
  if (metrics.distinctUsefulClaimCount === 1 && !metrics.singleClaimComplete) reasons.push("A single claim lacks enough subject, event, context and outcome for a complete micro-story.");
  if (!sources.length) reasons.push("No persisted source is linked to the story.");
  const strongSingleSource = sources.length === 1 && ["PRIMARY", "OFFICIAL", "ARCHIVAL_NEWSPAPER", "INSTITUTIONAL", "ACADEMIC"].includes(sources[0].reliabilityLevel)
    && metrics.ocrQualityScore >= .72;
  if (sources.length === 1 && !strongSingleSource) reasons.push("A one-source micro-story requires a clear archival, official, institutional or academic source.");
  if (metrics.sourceCoverage < 1 || metrics.unsupportedClaimCount) reasons.push("Every factual claim must resolve to persisted source IDs.");
  if (!hasHook) reasons.push("No grounded hook candidate.");
  if (!hasPayoff) reasons.push("No grounded payoff or unresolved ending.");
  if (metrics.storyCompletenessScore < .85) reasons.push("Story does not yet contain a complete subject, event, context and known ending.");
  if (metrics.supportedDurationSeconds < 8 || metrics.narrationWordCount < 20) reasons.push("Grounded narration is too thin even for an 8-second micro-story.");
  if (clusterConfidence === "LOW") reasons.push("Source cluster lacks validated date and entity continuity.");
  if (!narrationQuality?.passes) reasons.push("Malay spoken narration does not pass the language and naturalness gate.");
  if (requiresCurrentVerification) reasons.push("Current-aware verification is required before READY promotion.");
  return { status: reasons.length ? "PARTIAL" as const : "READY" as const, reasons: reasons.length ? reasons : ["All research and narration readiness gates passed."] };
}
