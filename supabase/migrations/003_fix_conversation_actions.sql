-- Prevent duplicate in_progress actions for the same conversation (race condition guard)
CREATE UNIQUE INDEX idx_conversation_actions_in_progress
  ON conversation_actions(conversation_id)
  WHERE status = 'in_progress';
