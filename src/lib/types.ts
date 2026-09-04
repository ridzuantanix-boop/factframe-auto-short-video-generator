export type SearchResult = {
  id: string;
  label: string;
  description: string;
  url: string;
};

export type StoryIndexStatus = "DISCOVERED" | "PARTIAL" | "READY" | "HIDDEN";

export type StoryCandidate = {
  id: string;
  canonicalEntityId: string | null;
  canonicalUrl: string | null;
  title: string;
  normalizedTitle: string;
  slug: string;
  summary: string;
  country: string;
  region: string;
  category: string;
  storyType: string;
  status: StoryIndexStatus;
  sourceCount: number;
  claimCount: number;
  researchScore: number | null;
  visualScore: number | null;
  narrativePotentialScore: number | null;
  sourceHints: string[];
  searchTerms: string[];
  aliases: string[];
  metadata: Record<string, unknown>;
  discoveredAt: string;
  lastResearchedAt: string | null;
  lastVerifiedAt: string | null;
  updatedAt: string;
  originProvider: string;
  originQuery: string;
};

export type StoryCandidateInput = Omit<StoryCandidate, "id" | "discoveredAt" | "updatedAt"> & {
  id?: string;
  discoveredAt?: string;
  updatedAt?: string;
};

export type EntityType = "person" | "place" | "event" | "object" | "organisation" | "animal" | "space" | "general";

export type Fact = {
  id?: string;
  label: string;
  sentence: string;
  sourceUrl: string;
};

export type Topic = {
  id: string;
  name: string;
  description: string;
  entityType: EntityType;
  facts: Fact[];
  narration: string;
  wikipediaUrl?: string;
  wikipediaExtract?: string;
  mystery?: MysteryScript;
  lastVerifiedAt?: string;
  currentAware?: boolean;
  contentMode?: ContentMode;
};

export type ContentMode = "STORY" | "MYSTERY";
export type StoryDuration = 30 | 60 | 90;
export type StoryTone = "DOCUMENTARY" | "SUSPENSEFUL";
export type StoryCategory = "UNSOLVED_MYSTERY" | "HISTORICAL_MYSTERY" | "DISAPPEARANCE" | "STRANGE_EVENT" | "CRIME_MYSTERY" | "CONSPIRACY_THEORY" | "PARANORMAL_CLAIM" | "URBAN_LEGEND" | "ARCHAEOLOGICAL_MYSTERY" | "UNEXPLAINED_PHENOMENON";
export type CaseStatus = "UNSOLVED" | "PARTIALLY_EXPLAINED" | "SOLVED" | "DISPUTED" | "LEGEND" | "REPORTED_CLAIM";
export type SourceReliability = "PRIMARY" | "INSTITUTIONAL" | "ACADEMIC" | "ARCHIVAL" | "REFERENCE" | "SECONDARY" | "LOW_CONFIDENCE";
export type ClaimType = "VERIFIED" | "REPORTED" | "THEORY" | "DISPUTED" | "UNRESOLVED" | "FOLKLORE" | "EXPLAINED_LATER";
export type VisualIntent = "ARCHIVAL_PHOTO" | "PORTRAIT" | "LOCATION" | "MAP" | "NEWSPAPER" | "DOCUMENT" | "TIMELINE" | "THEORY_CARD" | "FACT_CARD" | "EVIDENCE" | "ENDING";
export type MediaType = "image" | "video" | "programmatic";
export type VisualKind = "VIDEO" | "PHOTO" | "MAP" | "TIMELINE" | "DOCUMENT" | "NEWSPAPER" | "EVIDENCE_GRAPHIC" | "FACT_CARD" | "THEORY_CARD" | "DATE_CARD";
export type SegmentRole = "HOOK" | "OPEN_LOOP" | "CONTEXT" | "ESCALATION" | "TWIST" | "THEORY" | "COUNTERPOINT" | "PAYOFF";
export type StoryAngleType = "BIOGRAPHICAL_JOURNEY" | "TURNING_POINT" | "ORIGIN_STORY" | "TIMELINE" | "HOW_IT_CHANGED" | "WHY_IT_MATTERS" | "MAJOR_MOMENTS" | "HISTORICAL_OVERVIEW";
export type StoryAngle = { id: string; title: string; type: StoryAngleType; summary: string; supportingFactIds: string[]; narrativePotentialScore: number };

export type ResearchSource = {
  id: string;
  title: string;
  publisher: string;
  type: SourceReliability;
  url: string;
  date?: string;
  accessedAt: string;
  reliabilityLevel: SourceReliability;
};

export type StoryClaim = {
  id: string;
  claim: string;
  narration: string;
  type: ClaimType;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  sourceIds: string[];
  priority: "HOOK_WORTHY" | "ESSENTIAL_CONTEXT" | "ESCALATION_DETAIL" | "TWIST" | "THEORY" | "COUNTERPOINT" | "PAYOFF" | "LOW_PRIORITY";
  visualIntent: VisualIntent;
};

export type StoryRecord = {
  id: string;
  title: string;
  country: string;
  region: string;
  year: number;
  decade: string;
  category: StoryCategory;
  caseStatus: CaseStatus;
  summary: string;
  entityIds: string[];
  sourceHints: string[];
  visualSearchTerms: string[];
  researchScore: number;
  visualScore: number;
  sourceCoveragePotential: "good" | "limited";
  sources: ResearchSource[];
  claims: StoryClaim[];
};

export type MysterySegment = {
  role: SegmentRole;
  text: string;
  sourceIds: string[];
  claimType: ClaimType;
  visualIntent: VisualIntent;
  visualSearchQueries?: string[];
};

export type MysteryScript = {
  storyId: string;
  title: string;
  durationTarget: StoryDuration;
  tone: StoryTone;
  hook: string;
  openLoop: string;
  caseStatus: CaseStatus;
  segments: MysterySegment[];
  payoff: string;
  storytellingScore: number;
  repetitionScore: number;
  sourceCoverage: number;
  unsupportedClaims: number;
  sources: ResearchSource[];
  showSourceNote: boolean;
};

export type Visual = {
  id?: string;
  title: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  creator: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  description: string;
  source?: "Wikimedia Commons" | "FactFrame";
  mediaType?: MediaType;
  mimeType?: string;
  visualKind?: VisualKind;
  visualIntent?: VisualIntent;
  segmentIndex?: number;
  searchQuery?: string;
  relevanceScore?: number;
};

export type VisualQualityReport = {
  repetitionScore: number;
  relevanceScore: number;
  visualTypeDiversity: number;
  visualKinds: VisualKind[];
};

export type WatermarkPosition = "TOP_LEFT" | "TOP_CENTER" | "TOP_RIGHT" | "MIDDLE_LEFT" | "CENTER" | "MIDDLE_RIGHT" | "BOTTOM_LEFT" | "BOTTOM_CENTER" | "BOTTOM_RIGHT";
export type WatermarkConfig = {
  enabled: boolean;
  text: string;
  position: WatermarkPosition;
  opacity: number;
  size: "SMALL" | "MEDIUM" | "LARGE";
};

export type Scene = {
  image: Visual;
  caption: string;
  duration: number;
  visualIntent?: VisualIntent;
  sourceLabel?: string;
};
