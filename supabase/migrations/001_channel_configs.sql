-- Channel configs table
CREATE TABLE channel_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  system_prompt TEXT NOT NULL,
  voice_guidelines JSONB DEFAULT '{}',
  banned_phrases TEXT[] DEFAULT '{}',
  preferred_archetypes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add channel_config_id to generation_runs
ALTER TABLE generation_runs ADD COLUMN channel_config_id UUID REFERENCES channel_configs(id);

-- Store original inputs so chat actions can re-run the pipeline
ALTER TABLE generation_runs ADD COLUMN research_json JSONB;
ALTER TABLE generation_runs ADD COLUMN transcript_text TEXT;
