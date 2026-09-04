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
