import type { StoryIndexStatus } from "@/lib/types";

export function qualifyCandidate(sourceCount: number, claimCount: number): StoryIndexStatus {
  if (sourceCount >= 2 && claimCount >= 5) return "READY";
  if (sourceCount > 0 && claimCount > 0) return "PARTIAL";
  return "DISCOVERED";
}

export function calculateResearchScore(sourceCount: number, claimCount: number) {
  if (!sourceCount || !claimCount) return null;
  const sourceBreadth = Math.min(1, sourceCount / 3);
  const claimDepth = Math.min(1, claimCount / 8);
  return Number((sourceBreadth * 0.55 + claimDepth * 0.45).toFixed(3));
}
