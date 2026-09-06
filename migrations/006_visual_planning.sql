CREATE TABLE IF NOT EXISTS story_visual_assets (
  id text PRIMARY KEY, story_candidate_id text NOT NULL REFERENCES story_candidates(id) ON DELETE CASCADE,
  source_id text REFERENCES story_sources(id) ON DELETE SET NULL, provider_asset_id text, asset_type text NOT NULL, provider text NOT NULL,
  url text NOT NULL DEFAULT '', thumbnail_url text NOT NULL DEFAULT '', original_url text NOT NULL DEFAULT '', title text NOT NULL,
  description text NOT NULL DEFAULT '', creator text NOT NULL DEFAULT '', license text NOT NULL, license_url text NOT NULL DEFAULT '', attribution text NOT NULL DEFAULT '',
  published_at timestamptz, relevance_score double precision NOT NULL CHECK (relevance_score BETWEEN 0 AND 1), relevance_type text NOT NULL,
  representation_type text NOT NULL, visual_role text NOT NULL, usage_status text NOT NULL, content_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS story_visual_assets_story_provider_uidx ON story_visual_assets(story_candidate_id, provider, provider_asset_id) WHERE provider_asset_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS story_visual_assets_story_url_uidx ON story_visual_assets(story_candidate_id, original_url) WHERE original_url != '';
CREATE UNIQUE INDEX IF NOT EXISTS story_visual_assets_story_hash_uidx ON story_visual_assets(story_candidate_id, content_hash) WHERE content_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS story_visual_assets_candidate_idx ON story_visual_assets(story_candidate_id, usage_status, relevance_score DESC);
CREATE TABLE IF NOT EXISTS story_visual_plans (
  id text PRIMARY KEY, story_candidate_id text NOT NULL REFERENCES story_candidates(id) ON DELETE CASCADE, duration_seconds integer NOT NULL,
  status text NOT NULL CHECK (status IN ('NOT_PLANNED','PARTIAL','READY')), plan jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(story_candidate_id, duration_seconds)
);
