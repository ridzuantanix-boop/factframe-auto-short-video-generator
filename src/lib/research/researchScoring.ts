import type { StoredStorySource } from "../archive/types.ts";
import type { ResearchClaim } from "./types.ts";

function actionKinds(value: string) {
  return [
    /miss|disappear|vanish|search/, /death|dead|died|kill|murder|body/, /police|arrest|court|trial|charg|sentence/,
    /ghost|haunt|spirit|apparition/, /flood|fire|collapse|crash|accident|explosion/, /report|claim|record|said/,
    /found|recover|return|explain|resolve/,
  ].filter((pattern) => pattern.test(value)).length;
}

export function calculateResearchMetrics(claims: ResearchClaim[], sources: StoredStorySource[], storyType: string) {
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
  const uniqueWords = claims.reduce((sum, claim) => sum + claim.claimText.split(/\s+/).length, 0);
  const estimatedNarrationSeconds = Number(((uniqueWords + 10) / 2.25).toFixed(1));
  return { sourceCoverage: Number(sourceCoverage.toFixed(3)), unsupportedClaimCount, sourceDiversityScore: Number(sourceDiversityScore.toFixed(3)),
    claimDiversityScore: Number(claimDiversityScore.toFixed(3)), ocrQualityScore: Number(ocrQualityScore.toFixed(3)),
    researchScore: Number(researchScore.toFixed(3)), narrativePotentialScore: Number(narrativePotentialScore.toFixed(3)), estimatedNarrationSeconds };
}

export function decideResearchReadiness(claims: ResearchClaim[], sources: StoredStorySource[], metrics: ReturnType<typeof calculateResearchMetrics>, hasHook: boolean, hasPayoff: boolean, requiresCurrentVerification: boolean, sourcesAreCoherent = true) {
  const reasons: string[] = [];
  const usefulClaims = claims.filter((claim) => claim.confidence !== "LOW" && claim.ocrQuality >= .65);
  if (usefulClaims.length < 3) reasons.push("Fewer than three clear, useful factual claims.");
  const oneStrongSource = sources.length === 1 && usefulClaims.length >= 4 && metrics.ocrQualityScore >= .78;
  if (sources.length < 2 && !oneStrongSource) reasons.push("Needs two sources or one exceptionally clear source with four claims.");
  if (metrics.sourceCoverage < 1 || metrics.unsupportedClaimCount) reasons.push("Every factual claim must resolve to persisted source IDs.");
  if (!hasHook) reasons.push("No grounded hook candidate.");
  if (!hasPayoff) reasons.push("No grounded payoff or unresolved ending.");
  if (metrics.narrativePotentialScore < .55) reasons.push("Narrative potential is below 0.55.");
  const usefulWords = usefulClaims.reduce((sum, claim) => sum + claim.claimText.split(/\s+/).length, 0);
  if ((usefulWords + 10) / 2.25 < 20) reasons.push("Unique clear evidence is insufficient for about 20 seconds.");
  if (!sourcesAreCoherent) reasons.push("Linked archive reports span disconnected publication periods; deterministic research cannot safely treat them as one event.");
  if (requiresCurrentVerification) reasons.push("Current-aware verification is required before READY promotion.");
  return { status: reasons.length ? "PARTIAL" as const : "READY" as const, reasons: reasons.length ? reasons : ["All research and narration readiness gates passed."] };
}
