import { createHash } from "node:crypto";
import type { RawResearchClaim, ResearchClaim } from "./types.ts";

function tokens(value: string) { return new Set(value.split(/\s+/).filter(Boolean)); }
function jaccard(left: Set<string>, right: Set<string>) {
  const union = new Set([...left, ...right]); if (!union.size) return 0;
  return [...left].filter((token) => right.has(token)).length / union.size;
}
function actions(value: string) {
  const groups = [
    /miss|disappear|vanish|search/, /death|dead|died|kill|murder|body/, /police|arrest|court|trial|charg|sentence/,
    /ghost|haunt|spirit|apparition/, /flood|fire|collapse|crash|accident|explosion/, /report|claim|record|said/,
  ];
  return groups.map((pattern, index) => pattern.test(value) ? index : -1).filter((index) => index >= 0);
}
function overlaps(left: string[], right: string[]) { return left.some((value) => right.includes(value)); }
function duplicate(left: RawResearchClaim, right: RawResearchClaim) {
  if (left.normalizedClaim === right.normalizedClaim) return true;
  const similarity = jaccard(tokens(left.normalizedClaim), tokens(right.normalizedClaim));
  if (similarity >= .64) return true;
  const sameDate = Boolean(left.eventDate && right.eventDate && left.eventDate.slice(0, 10) === right.eventDate.slice(0, 10));
  const sameAction = overlaps(actions(left.normalizedClaim).map(String), actions(right.normalizedClaim).map(String));
  const samePlace = overlaps(left.locations, right.locations);
  return similarity >= .4 && sameAction && (sameDate || samePlace);
}

function mergeGroup(group: RawResearchClaim[]): ResearchClaim {
  const best = [...group].sort((a, b) => b.ocrQuality - a.ocrQuality || b.claimText.length - a.claimText.length)[0];
  const sourceIds = [...new Set(group.flatMap((claim) => claim.sourceIds))];
  const independentSources = new Set(group.map((claim) => `${claim.sourceProvider}:${claim.sourcePublisher}`)).size;
  const confidence = independentSources >= 2 ? "HIGH" : best.ocrQuality >= .68 ? "MEDIUM" : "LOW";
  const normalizedClaim = best.normalizedClaim;
  return { id: createHash("sha256").update(`${best.storyCandidateId}:${normalizedClaim}`).digest("hex").slice(0, 32),
    storyCandidateId: best.storyCandidateId, claimText: best.claimText, normalizedClaim, claimType: best.claimType, confidence, sourceIds,
    eventDate: best.eventDate, people: [...new Set(group.flatMap((claim) => claim.people))],
    locations: [...new Set(group.flatMap((claim) => claim.locations))], priority: best.priority, visualIntent: best.visualIntent,
    ocrQuality: Number((group.reduce((sum, claim) => sum + claim.ocrQuality, 0) / group.length).toFixed(3)) };
}

export function mergeDuplicateClaims(rawClaims: RawResearchClaim[]) {
  const groups: RawResearchClaim[][] = [];
  for (const claim of rawClaims) {
    const group = groups.find((items) => items.some((item) => duplicate(item, claim)));
    if (group) group.push(claim); else groups.push([claim]);
  }
  const claims = groups.map(mergeGroup).sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? "") || b.sourceIds.length - a.sourceIds.length).slice(0, 12);
  return { claims, mergedClaimCount: rawClaims.length - claims.length };
}
