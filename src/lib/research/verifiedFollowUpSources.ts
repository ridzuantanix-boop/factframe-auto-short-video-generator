import type { ArchiveDocument } from "../archive/types.ts";

// Editorially verified public follow-up evidence. These are source records, not engine rules.
export const verifiedFollowUpSources: ArchiveDocument[] = [{
  provider: "THE_STAR", providerId: "nuri-crash-3-dead-7-safe", sourceType: "ARCHIVAL_NEWSPAPER", title: "Nuri crash: 3 dead, 7 safe",
  publisher: "The Star", url: "https://www.thestar.com.my/news/nation/2004/08/17/nuri-crash-3-dead-7-safe", publishedAt: "2004-08-17T00:00:00.000Z",
  accessedAt: "2026-09-05T00:00:00.000Z", snippet: "Three Royal Malaysian Air Force personnel were killed when a Nuri helicopter crash-landed 15 kilometres from Ba'Kelalan. The Nuri with 10 people on board was found in a forested area about 1,500 metres above sea level.",
  originalLocationTerms: ["Ba'Kelalan", "Sarawak"], people: ["Royal Malaysian Air Force"], reliabilityLevel: "REPUTABLE_JOURNALISM",
  metadata: { sourceRole: "FOLLOW_UP", verificationType: "HISTORICAL_FOLLOW_UP", verifiedClaims: [
    "The Nuri helicopter was found in a forested area about 1,500 metres above sea level, 15 kilometres from Ba'Kelalan.",
    "Three Royal Malaysian Air Force personnel were killed in the crash.",
    "Seven people survived the crash."
  ], editoriallyVerifiedAt: "2026-09-05T00:00:00.000Z" }
}];
