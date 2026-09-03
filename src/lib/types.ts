export type SearchResult = {
  id: string;
  label: string;
  description: string;
  url: string;
};

export type EntityType = "person" | "place" | "event" | "object" | "organisation" | "animal" | "space" | "general";

export type Fact = {
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
};

export type ContentMode = "QUICK_FACTS" | "MYSTERY";
export type StoryDuration = 30 | 60 | 90;
export type StoryTone = "DOCUMENTARY" | "SUSPENSEFUL";
export type StoryCategory = "UNSOLVED_MYSTERY" | "HISTORICAL_MYSTERY" | "DISAPPEARANCE" | "STRANGE_EVENT" | "CRIME_MYSTERY" | "CONSPIRACY_THEORY" | "PARANORMAL_CLAIM" | "URBAN_LEGEND" | "ARCHAEOLOGICAL_MYSTERY" | "UNEXPLAINED_PHENOMENON";
export type CaseStatus = "UNSOLVED" | "PARTIALLY_EXPLAINED" | "SOLVED" | "DISPUTED" | "LEGEND" | "REPORTED_CLAIM";
export type SourceReliability = "PRIMARY" | "INSTITUTIONAL" | "ACADEMIC" | "ARCHIVAL" | "REFERENCE" | "SECONDARY" | "LOW_CONFIDENCE";
export type ClaimType = "VERIFIED" | "REPORTED" | "THEORY" | "DISPUTED" | "UNRESOLVED" | "FOLKLORE" | "EXPLAINED_LATER";
export type VisualIntent = "ARCHIVAL_PHOTO" | "PORTRAIT" | "LOCATION" | "MAP" | "NEWSPAPER" | "DOCUMENT" | "TIMELINE" | "THEORY_CARD" | "FACT_CARD" | "EVIDENCE" | "ENDING";
export type SegmentRole = "HOOK" | "OPEN_LOOP" | "CONTEXT" | "ESCALATION" | "TWIST" | "THEORY" | "COUNTERPOINT" | "PAYOFF";

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
  sourceCoverage: number;
  unsupportedClaims: number;
  sources: ResearchSource[];
  showSourceNote: boolean;
};

export type Visual = {
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
};

export type Scene = {
  image: Visual;
  caption: string;
  duration: number;
  visualIntent?: VisualIntent;
  sourceLabel?: string;
};
