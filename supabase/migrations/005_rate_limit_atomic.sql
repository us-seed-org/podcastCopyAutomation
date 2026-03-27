CREATE OR REPLACE FUNCTION check_and_increment_rate_limit(
  p_key         TEXT,
  p_window_start BIGINT
)
RETURNS INT LANGUAGE plpgsql AS $
DECLARE
  v_count INT;
BEGIN
  INSERT INTO rate_limits (key, window_start, count)
  VALUES (p_key, p_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$;
