ALTER TABLE story_claims ADD COLUMN IF NOT EXISTS rewrite_method text NOT NULL DEFAULT 'NONE';
ALTER TABLE story_claims ADD COLUMN IF NOT EXISTS rewrite_model text;
ALTER TABLE story_claims ADD COLUMN IF NOT EXISTS validated_at timestamptz;
ALTER TABLE story_claims ADD COLUMN IF NOT EXISTS validation_version text;
ALTER TABLE story_claims ADD COLUMN IF NOT EXISTS validation_result jsonb;
