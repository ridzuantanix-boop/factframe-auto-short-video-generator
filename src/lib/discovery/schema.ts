export const STORY_INDEX_SCHEMA = `
CREATE TABLE IF NOT EXISTS story_candidates (
  id text PRIMARY KEY,
  canonical_entity_id text,
  canonical_url text,
  title text NOT NULL,
  normalized_title text NOT NULL,
  slug text NOT NULL,
  summary text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'Global',
  region text NOT NULL DEFAULT 'Global',
  category text NOT NULL,
  story_type text NOT NULL,
  status text NOT NULL DEFAULT 'DISCOVERED' CHECK (status IN ('DISCOVERED', 'PARTIAL', 'READY', 'HIDDEN')),
  source_count integer NOT NULL DEFAULT 0 CHECK (source_count >= 0),
  claim_count integer NOT NULL DEFAULT 0 CHECK (claim_count >= 0),
  research_score double precision CHECK (research_score BETWEEN 0 AND 1),
  visual_score double precision CHECK (visual_score BETWEEN 0 AND 1),
  narrative_potential_score double precision CHECK (narrative_potential_score BETWEEN 0 AND 1),
  source_hints jsonb NOT NULL DEFAULT '[]'::jsonb,
  search_terms jsonb NOT NULL DEFAULT '[]'::jsonb,
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  last_researched_at timestamptz,
  last_verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  origin_provider text NOT NULL,
  origin_query text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS story_candidates_entity_uidx ON story_candidates (canonical_entity_id) WHERE canonical_entity_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS story_candidates_url_uidx ON story_candidates (canonical_url) WHERE canonical_url IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS story_candidates_title_uidx ON story_candidates (normalized_title);
CREATE INDEX IF NOT EXISTS story_candidates_browse_idx ON story_candidates (status, category, country, updated_at DESC);
CREATE INDEX IF NOT EXISTS story_candidates_search_idx ON story_candidates USING gin (to_tsvector('simple', title || ' ' || summary));
CREATE TABLE IF NOT EXISTS story_sources (
  id text PRIMARY KEY,
  story_candidate_id text NOT NULL REFERENCES story_candidates(id) ON DELETE CASCADE,
  provider text NOT NULL,
  source_type text NOT NULL,
  title text NOT NULL,
  publisher text NOT NULL DEFAULT '',
  url text NOT NULL,
  published_at timestamptz,
  accessed_at timestamptz NOT NULL,
  snippet text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reliability_level text NOT NULL,
  UNIQUE (provider, url)
);
CREATE INDEX IF NOT EXISTS story_sources_candidate_idx ON story_sources (story_candidate_id, published_at);
CREATE INDEX IF NOT EXISTS story_sources_provider_idx ON story_sources (provider, source_type);
CREATE TABLE IF NOT EXISTS story_claims (
  id text PRIMARY KEY,
  story_candidate_id text NOT NULL REFERENCES story_candidates(id) ON DELETE CASCADE,
  claim_text text NOT NULL,
  spoken_text text NOT NULL DEFAULT '',
  rewrite_method text NOT NULL DEFAULT 'NONE',
  rewrite_model text,
  validated_at timestamptz,
  validation_version text,
  validation_result jsonb,
  normalized_claim text NOT NULL,
  claim_type text NOT NULL CHECK (claim_type IN ('VERIFIED', 'REPORTED', 'DISPUTED', 'UNRESOLVED', 'FOLKLORE', 'THEORY', 'EXPLAINED_LATER')),
  confidence text NOT NULL CHECK (confidence IN ('HIGH', 'MEDIUM', 'LOW')),
  source_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  event_date timestamptz,
  people jsonb NOT NULL DEFAULT '[]'::jsonb,
  locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority text NOT NULL,
  visual_intent text NOT NULL DEFAULT 'DOCUMENT',
  ocr_quality double precision NOT NULL DEFAULT 0 CHECK (ocr_quality BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_candidate_id, normalized_claim)
);
CREATE INDEX IF NOT EXISTS story_claims_candidate_idx ON story_claims (story_candidate_id, priority, event_date);
ALTER TABLE story_claims ADD COLUMN IF NOT EXISTS spoken_text text NOT NULL DEFAULT '';
ALTER TABLE story_claims ADD COLUMN IF NOT EXISTS rewrite_method text NOT NULL DEFAULT 'NONE';
ALTER TABLE story_claims ADD COLUMN IF NOT EXISTS rewrite_model text;
ALTER TABLE story_claims ADD COLUMN IF NOT EXISTS validated_at timestamptz;
ALTER TABLE story_claims ADD COLUMN IF NOT EXISTS validation_version text;
ALTER TABLE story_claims ADD COLUMN IF NOT EXISTS validation_result jsonb;
CREATE TABLE IF NOT EXISTS story_research_packages (
  story_candidate_id text PRIMARY KEY REFERENCES story_candidates(id) ON DELETE CASCADE,
  package jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS story_visual_assets (
  id text PRIMARY KEY,
  story_candidate_id text NOT NULL REFERENCES story_candidates(id) ON DELETE CASCADE,
  source_id text REFERENCES story_sources(id) ON DELETE SET NULL,
  provider_asset_id text,
  asset_type text NOT NULL,
  provider text NOT NULL,
  url text NOT NULL DEFAULT '', thumbnail_url text NOT NULL DEFAULT '', original_url text NOT NULL DEFAULT '',
  title text NOT NULL, description text NOT NULL DEFAULT '', creator text NOT NULL DEFAULT '',
  license text NOT NULL, license_url text NOT NULL DEFAULT '', attribution text NOT NULL DEFAULT '', published_at timestamptz,
  relevance_score double precision NOT NULL CHECK (relevance_score BETWEEN 0 AND 1),
  relevance_type text NOT NULL, representation_type text NOT NULL, visual_role text NOT NULL, usage_status text NOT NULL,
  content_hash text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
DROP INDEX IF EXISTS story_visual_assets_provider_uidx;
DROP INDEX IF EXISTS story_visual_assets_url_uidx;
DROP INDEX IF EXISTS story_visual_assets_hash_uidx;
CREATE UNIQUE INDEX IF NOT EXISTS story_visual_assets_story_provider_uidx ON story_visual_assets(story_candidate_id, provider, provider_asset_id) WHERE provider_asset_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS story_visual_assets_story_url_uidx ON story_visual_assets(story_candidate_id, original_url) WHERE original_url != '';
CREATE UNIQUE INDEX IF NOT EXISTS story_visual_assets_story_hash_uidx ON story_visual_assets(story_candidate_id, content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS story_visual_assets_candidate_idx ON story_visual_assets(story_candidate_id, usage_status, relevance_score DESC);
CREATE TABLE IF NOT EXISTS story_visual_plans (
  id text PRIMARY KEY, story_candidate_id text NOT NULL REFERENCES story_candidates(id) ON DELETE CASCADE,
  duration_seconds integer NOT NULL, status text NOT NULL CHECK (status IN ('NOT_PLANNED','PARTIAL','READY')),
  plan jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(story_candidate_id, duration_seconds)
);
`;
