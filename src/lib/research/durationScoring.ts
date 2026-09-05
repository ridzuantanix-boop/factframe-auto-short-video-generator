import type { ResearchClaim } from "./types.ts";

export type SupportedDurationBand = "MICRO" | "SHORT" | "STANDARD" | "LONG";
export type StoryEndingType = "RESOLVED" | "UNRESOLVED" | "FOLLOW_UP" | "DOCUMENTED_FACT" | "REPORTED_CLAIM" | "FOLKLORE_OPEN_END";

const EVENT = /\b(?:hilang|kehilangan|mencari|pencarian|ditemui|dijumpai|maut|mati|dibunuh|membunuh|kemalangan|nahas|karam|terbalik|ditahan|didakwa|disabitkan|dihukum|dilaporkan|berlaku|menyerang|terbunuh|banjir|kebakaran|runtuh)\b/i;
const OUTCOME = /\b(?:masih|belum|akhirnya|kemudian|berjaya|diselamatkan|ditemui|dijumpai|maut|mati|dibebaskan|disabitkan|dihukum|diteruskan|ditutup|selesai|kekal|tiada|tidak diketahui)\b/i;
const CONTEXT = /\b(?:pada|ketika|selepas|sebelum|semasa|di|dari|berhampiran|tahun|bulan|hari)\b/i;
const GENERIC = new Set(["dilaporkan", "laporan", "menurut", "berlaku", "terdapat", "seorang", "sebuah", "dalam", "yang", "telah"]);

function words(value: string) { return value.trim().split(/\s+/).filter(Boolean); }
function usable(claim: ResearchClaim) { return claim.confidence !== "LOW" && claim.ocrQuality >= .65 && Boolean(claim.spokenText?.trim()); }
function normalizedTokens(value: string) { return new Set((value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length > 2)); }
function overlap(left: Set<string>, right: Set<string>) { return [...left].filter((token) => right.has(token)).length / Math.max(1, Math.min(left.size, right.size)); }

export function distinctUsefulClaims(claims: ResearchClaim[]) {
  const result: ResearchClaim[] = [];
  for (const claim of claims.filter(usable)) {
    const current = normalizedTokens(claim.spokenText);
    if (!result.some((item) => overlap(current, normalizedTokens(item.spokenText)) >= .48)) result.push(claim);
  }
  return result;
}

export function durationBand(seconds: number): SupportedDurationBand {
  if (seconds <= 12) return "MICRO";
  if (seconds <= 20) return "SHORT";
  if (seconds <= 35) return "STANDARD";
  return "LONG";
}

export function endingTypeFor(storyType: string, claims: ResearchClaim[]): StoryEndingType {
  const usefulClaims = distinctUsefulClaims(claims); const last = usefulClaims.at(-1);
  if (storyType === "FOLKLORE" || last?.claimType === "FOLKLORE") return "FOLKLORE_OPEN_END";
  if (last?.claimType === "EXPLAINED_LATER") return "RESOLVED";
  if (last?.claimType === "UNRESOLVED" || ["DISAPPEARANCE", "UNEXPLAINED_EVENT"].includes(storyType)) return "UNRESOLVED";
  if (new Set(usefulClaims.map((claim) => claim.eventDate).filter(Boolean)).size >= 2) return "FOLLOW_UP";
  if (last?.claimType === "REPORTED") return "REPORTED_CLAIM";
  return "DOCUMENTED_FACT";
}

export function calculateEvidenceDuration(claims: ResearchClaim[], storyType: string, hasPayoff: boolean) {
  const usefulClaims = distinctUsefulClaims(claims); const narrationWordCount = usefulClaims.reduce((sum, claim) => sum + words(claim.spokenText).length, 0);
  const estimatedNarrationSeconds = Number((narrationWordCount / 2.25).toFixed(1));
  const claimCap = usefulClaims.length <= 1 ? 12 : usefulClaims.length === 2 ? 15 : usefulClaims.length <= 4 ? 30 : usefulClaims.length <= 7 ? 45 : 60;
  const evidenceSeconds = Math.min(60, claimCap, estimatedNarrationSeconds);
  const supportedDurationSeconds = Math.max(0, Math.round(evidenceSeconds));
  const combined = usefulClaims.map((claim) => claim.spokenText).join(" "); const first = usefulClaims[0]; const last = usefulClaims.at(-1);
  const clearSubject = Boolean(first && (first.people.length || first.locations.length || words(first.spokenText).length >= 6));
  const clearEvent = EVENT.test(combined); const usefulContext = Boolean(usefulClaims.some((claim) => claim.eventDate || claim.locations.length || CONTEXT.test(claim.spokenText)));
  const firstTokens = new Set([...normalizedTokens(first?.spokenText ?? "")].filter((token) => !GENERIC.has(token))); const lastTokens = new Set([...normalizedTokens(last?.spokenText ?? "")].filter((token) => !GENERIC.has(token)));
  const continuity = usefulClaims.length <= 1 || overlap(firstTokens, lastTokens) >= .15 || OUTCOME.test(last?.spokenText ?? "");
  const specificDetail = /\b(?:[A-Z][\p{L}'’.-]+\s+[A-Z0-9][\p{L}\p{N}'’.-]+|[A-Z]{2,}\d*|\d+)\b/u.test((last?.spokenText ?? "").replace(/^[\p{L}]+\s/u, ""));
  const meaningfulResult = usefulClaims.length <= 1 ? OUTCOME.test(combined) : OUTCOME.test(last?.spokenText ?? "") || specificDetail
    || (words(last?.spokenText ?? "").length >= 9 && overlap(firstTokens, lastTokens) >= .15 && overlap(firstTokens, lastTokens) < .7);
  const knownEnding = Boolean(hasPayoff && last?.spokenText.trim());
  const storyCompletenessScore = Number((Number(clearSubject) * .15 + Number(clearEvent) * .2 + Number(usefulContext) * .15
    + Number(meaningfulResult) * .2 + Number(knownEnding) * .15 + Number(continuity) * .15).toFixed(3));
  const singleClaimComplete = usefulClaims.length === 1 && narrationWordCount >= 20 && clearSubject && clearEvent && usefulContext && meaningfulResult && knownEnding;
  return { supportedDurationSeconds, supportedDurationBand: durationBand(supportedDurationSeconds), estimatedNarrationSeconds, narrationWordCount,
    storyCompletenessScore, endingType: endingTypeFor(storyType, usefulClaims), distinctUsefulClaimCount: usefulClaims.length, singleClaimComplete };
}
