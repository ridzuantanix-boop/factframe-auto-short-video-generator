import type { MysteryScript, StoryRecord, VisualIntent } from "../types.ts";

export type AssetType = "ARCHIVAL_PHOTO" | "ARCHIVAL_VIDEO" | "NEWSPAPER_CLIP" | "MAP" | "TIMELINE" | "LOCATION" | "PORTRAIT" | "DOCUMENT" | "ENTITY_IMAGE" | "FACT_CARD";
export type AssetProvider = "WIKIMEDIA_COMMONS" | "WIKIDATA" | "INDEXED_ARCHIVE" | "OPENSTREETMAP" | "FACTFRAME";
export type RelevanceType = "EXACT_EVENT" | "EXACT_ENTITY" | "EXACT_PLACE" | "HISTORICAL_CONTEXT" | "GENERIC_CONTEXT" | "FALLBACK";
export type RepresentationType = "EXACT" | "CONTEXTUAL" | "PROGRAMMATIC";
export type UsageStatus = "REUSABLE" | "RESTRICTED_REFERENCE" | "GENERATED_SAFE" | "REJECTED";
export type VisualReadiness = "NOT_PLANNED" | "PARTIAL" | "READY";

export type VisualAssetRecord = {
  id: string; storyCandidateId: string; sourceId: string | null; providerAssetId: string | null;
  assetType: AssetType; provider: AssetProvider; url: string; thumbnailUrl: string; originalUrl: string;
  title: string; description: string; creator: string; license: string; licenseUrl: string; attribution: string;
  publishedAt: string | null; relevanceScore: number; relevanceType: RelevanceType; representationType: RepresentationType;
  visualRole: string; usageStatus: UsageStatus; contentHash: string | null; metadata: Record<string, unknown>;
};

export type VisualPlanSegment = {
  segmentId: string; segmentIndex: number; narration: string; claimIds: string[]; sourceIds: string[];
  visualIntent: VisualIntent; assetIds: string[]; fallbackType: AssetType | null; startTime: number; endTime: number; reason: string;
};

export type VisualPlan = {
  id: string; storyCandidateId: string; durationSeconds: number; status: VisualReadiness; segments: VisualPlanSegment[];
  assets: VisualAssetRecord[]; visualCoverageScore: number; realAssetCoverage: number; fallbackCoverage: number;
  createdAt: string; metadata: Record<string, unknown>;
};

export type AssetSearchContext = {
  story: StoryRecord; script: MysteryScript; segmentIndex: number; query: string; locations: string[]; people: string[];
};

export interface AssetSearchProvider {
  id: AssetProvider;
  search(context: AssetSearchContext): Promise<VisualAssetRecord[]>;
}
