import type { ClaimType, ResearchSource, StoryClaim, StoryIndexStatus } from "../types.ts";

export type ResearchClaim = {
  id: string;
  storyCandidateId: string;
  claimText: string;
  spokenText: string;
  normalizedClaim: string;
  claimType: ClaimType;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  sourceIds: string[];
  eventDate: string | null;
  people: string[];
  locations: string[];
  priority: StoryClaim["priority"];
  visualIntent: StoryClaim["visualIntent"];
  ocrQuality: number;
};

export type ResearchTimelineEntry = {
  id: string;
  date: string | null;
  dateBasis: "EVENT_DATE" | "PUBLICATION_DATE" | "UNKNOWN";
  text: string;
  claimIds: string[];
  sourceIds: string[];
  confidence: ResearchClaim["confidence"];
};

export type GroundedNarrativeElement = { text: string; claimIds: string[]; sourceIds: string[] };

export type ResearchPackage = {
  storyCandidateId: string;
  title: string;
  summary: string;
  storyType: string;
  historicalContext: string;
  sources: Array<ResearchSource & { sourceRole: "PRIMARY_OFFICIAL" | "ARCHIVAL_NEWSPAPER" | "INSTITUTIONAL" | "REFERENCE" }>;
  claims: ResearchClaim[];
  timeline: ResearchTimelineEntry[];
  people: string[];
  locations: string[];
  hookCandidates: GroundedNarrativeElement[];
  keyTurningPoints: GroundedNarrativeElement[];
  unresolvedQuestions: GroundedNarrativeElement[];
  payoff: GroundedNarrativeElement;
  clusterConfidence: "HIGH" | "MEDIUM" | "LOW";
  narrationQuality: {
    malayLanguageRatio: number;
    englishLeakageCount: number;
    ocrLeakageCount: number;
    fragmentCount: number;
    headlineLeakageCount: number;
    spokenNaturalnessScore: number;
    passes: boolean;
  };
  sourceCoverage: number;
  unsupportedClaimCount: number;
  sourceDiversityScore: number;
  claimDiversityScore: number;
  ocrQualityScore: number;
  researchScore: number;
  narrativePotentialScore: number;
  estimatedNarrationSeconds: number;
  readyDecision: { status: Extract<StoryIndexStatus, "READY" | "PARTIAL">; reasons: string[] };
  requiresCurrentVerification: boolean;
  lastResearchedAt: string;
  lastVerifiedAt: string;
};

export type RawResearchClaim = ResearchClaim & { sourcePublisher: string; sourceProvider: string };
