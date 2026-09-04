export type ArchiveSourceType = "ARCHIVAL_NEWSPAPER" | "ARCHIVAL_RECORD" | "ARCHIVAL_IMAGE" | "ORAL_HISTORY" | "GOVERNMENT_RECORD";
export type ArchiveReliability = "PRIMARY" | "OFFICIAL" | "INSTITUTIONAL" | "ARCHIVAL_NEWSPAPER" | "ACADEMIC" | "REFERENCE" | "REPUTABLE_JOURNALISM" | "OTHER";
export type ArchiveClaimStatus = "VERIFIED" | "REPORTED" | "DISPUTED" | "UNRESOLVED" | "FOLKLORE" | "THEORY" | "EXPLAINED_LATER";
export type ArchiveStoryType = "DISAPPEARANCE" | "CRIME_MYSTERY" | "MYSTERIOUS_DEATH" | "STRANGE_EVENT" | "HISTORICAL_INCIDENT" | "PARANORMAL_REPORT" | "URBAN_LEGEND_SOURCE" | "FOLKLORE" | "DISASTER" | "UNEXPLAINED_EVENT" | "HISTORICAL_CURIOSITY";
export type HistoricalContext = "MALAYA" | "STRAITS_SETTLEMENTS" | "NORTH_BORNEO" | "SARAWAK" | "MODERN_MALAYSIA";

export type ProviderSearchOptions = { page: number; limit: number; timeoutMs?: number };
export type ProviderSearchResult<Raw = unknown> = { results: Raw[]; total: number };

export type ArchiveDocument = {
  provider: string;
  providerId: string;
  sourceType: ArchiveSourceType;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
  accessedAt: string;
  snippet: string;
  originalLocationTerms: string[];
  people: string[];
  metadata: Record<string, unknown>;
  reliabilityLevel: ArchiveReliability;
};

export type ExtractedArchiveEvent = {
  document: ArchiveDocument;
  locations: string[];
  originalLocations: string[];
  people: string[];
  eventVerbs: string[];
  incidentType: ArchiveStoryType;
  claimStatus: ArchiveClaimStatus;
  historicalContext: HistoricalContext;
  eventDate: string | null;
  headlineTokens: string[];
  claim: string;
};

export type DiscoveryProvider<Raw = unknown> = {
  id: string;
  search(query: string, options: ProviderSearchOptions): Promise<ProviderSearchResult<Raw>>;
  normalize(result: Raw): ArchiveDocument | null;
  fetchDetails(result: Raw): Promise<ArchiveDocument | null>;
};

export type StorySourceInput = {
  id?: string;
  storyCandidateId: string;
  provider: string;
  sourceType: ArchiveSourceType;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
  accessedAt: string;
  snippet: string;
  metadata: Record<string, unknown>;
  reliabilityLevel: ArchiveReliability;
};
