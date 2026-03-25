-- Conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES generation_runs(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_conversations_run_id ON conversations(run_id);
-- Prevent duplicate active conversations for the same run (race condition guard)
CREATE UNIQUE INDEX idx_conversations_active_run ON conversations(run_id) WHERE status = 'active';

-- Atomic message append (avoids read-modify-write race)
CREATE OR REPLACE FUNCTION append_conversation_message(
  p_conversation_id UUID,
  p_message JSONB
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE conversations
  SET messages = messages || jsonb_build_array(p_message),
      updated_at = now()
  WHERE id = p_conversation_id;
END;
$$;

-- Conversation actions table
CREATE TABLE conversation_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('regenerate', 'rescore', 'rerank', 'recontent')),
  parameters JSONB,
  triggered_by_message_index INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_conversation_actions_conversation_id ON conversation_actions(conversation_id);
