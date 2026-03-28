import { supabase } from "@/lib/supabase";

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  if (!supabase) {
    console.debug("[rate-limit] DB not configured — allowing");
    return true;
  }

  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;

  const { data: currentCount, error } = await supabase.rpc(
    "check_and_increment_rate_limit",
    { p_key: key, p_window_start: windowStart }
  );

  if (error) {
    console.error("[rate-limit] RPC error:", error);
    return true; // fail open
  }

  console.debug(`[rate-limit] key=${key} count=${currentCount} limit=${limit}`);
  return (currentCount as number) <= limit;
}
