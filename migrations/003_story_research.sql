CREATE TABLE IF NOT EXISTS story_claims (
  id text PRIMARY KEY,
  story_candidate_id text NOT NULL REFERENCES story_candidates(id) ON DELETE CASCADE,
  claim_text text NOT NULL,
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

CREATE TABLE IF NOT EXISTS story_research_packages (
  story_candidate_id text PRIMARY KEY REFERENCES story_candidates(id) ON DELETE CASCADE,
  package jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
