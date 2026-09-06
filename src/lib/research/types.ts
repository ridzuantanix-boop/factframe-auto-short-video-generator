import type { ClaimType, ResearchSource, StoryClaim, StoryIndexStatus } from "../types.ts";
import type { StoryEndingType, SupportedDurationBand } from "./durationScoring.ts";

export type StoryCaseState = "DOCUMENTED" | "UNRESOLVED" | "MISSING" | "SEARCH_ONGOING" | "INVESTIGATION_ONGOING" | "UNKNOWN" | "AWAITING_RESULT" | "REPORTED_MISSING" | "TRIAL_PENDING" | "CAUSE_UNKNOWN" | "RESOLVED" | "FOUND" | "IDENTIFIED" | "EXPLAINED_LATER" | "CASE_OUTCOME";
export type VerificationType = "HISTORICAL_FOLLOW_UP" | "CURRENT_VERIFICATION" | null;
export type VerificationStatus = "NOT_REQUIRED" | "PENDING" | "VERIFIED" | "FAILED" | "STALE";

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
  rewriteMethod: "NONE" | "DETERMINISTIC" | "GEMINI";
  rewriteModel: string | null;
  validatedAt: string | null;
  validationVersion: string | null;
  validationResult: ClaimValidationResult | null;
};

export type ClaimValidationResult = { valid: boolean; reasons: string[]; hardFails?: string[]; softWarnings?: string[]; entityTypes?: Record<string, string>; checkedAt: string; version: string };
export type AiNarrationSegment = { role: "HOOK" | "CONTEXT" | "DEVELOPMENT" | "TURN_PAYOFF"; text: string; claimIds: string[]; sourceIds: string[] };
export type AiNarration = { segments: AiNarrationSegment[]; model: string; generatedAt: string; validationVersion: string; requestCount: number; inputTokens: number; outputTokens: number };

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
  sources: Array<ResearchSource & { sourceRole: "PRIMARY_OFFICIAL" | "ARCHIVAL_NEWSPAPER" | "INSTITUTIONAL" | "REFERENCE" | "FOLLOW_UP" }>;
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
    unnaturalPhraseCount: number;
    headlineLeakageCount: number;
    spokenNaturalnessScore: number;
    passes: boolean;
  };
  aiNarration?: AiNarration;
  sourceCoverage: number;
  unsupportedClaimCount: number;
  sourceDiversityScore: number;
  claimDiversityScore: number;
  ocrQualityScore: number;
  researchScore: number;
  narrativePotentialScore: number;
  estimatedNarrationSeconds: number;
  supportedDurationSeconds: number;
  supportedDurationBand: SupportedDurationBand;
  storyCompletenessScore: number;
  endingType: StoryEndingType;
  caseStateAtSourceTime: StoryCaseState;
  latestKnownState: StoryCaseState;
  resolutionClaimIds: string[];
  resolutionSourceIds: string[];
  resolvedAt: string | null;
  verificationStatus: VerificationStatus;
  verificationType: VerificationType;
  verifiedAt: string | null;
  verificationTTL: number | null;
  nextVerificationDue: string | null;
  narrationWordCount: number;
  distinctUsefulClaimCount: number;
  singleClaimComplete: boolean;
  readyDecision: { status: Extract<StoryIndexStatus, "READY" | "PARTIAL">; reasons: string[] };
  requiresCurrentVerification: boolean;
  lastResearchedAt: string;
  lastVerifiedAt: string | null;
};

export type RawResearchClaim = ResearchClaim & { sourcePublisher: string; sourceProvider: string };
