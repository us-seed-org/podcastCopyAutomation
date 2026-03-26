-- Persistent rate limits using Supabase instead of in-memory Map
-- Solves the cold-start / serverless instance isolation problem
CREATE TABLE rate_limits (
  key         TEXT NOT NULL,
  window_start BIGINT NOT NULL,  -- Unix ms, truncated to window
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

CREATE INDEX idx_rate_limits_key_window ON rate_limits(key, window_start);
