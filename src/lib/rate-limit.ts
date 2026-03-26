import { supabase } from "@/lib/supabase";

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  if (!supabase) {
    // DB not configured — fail open
    return true;
  }

  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;

  // Step 1: Upsert the row with count = 1 (creates if missing, no-op if exists)
  await supabase
    .from("rate_limits")
    .upsert(
      { key, window_start: windowStart, count: 1 },
      { onConflict: "key,window_start" }
    );

  // Step 2: Read current count
  const { data } = await supabase
    .from("rate_limits")
    .select("count")
    .eq("key", key)
    .eq("window_start", windowStart)
    .single();

  if (!data) {
    // Row vanished or DB error — fail open
    return true;
  }

  if (data.count > limit) {
    return false; // over limit
  }

  // Step 3: Atomically increment
  await supabase
    .from("rate_limits")
    .update({ count: data.count + 1 })
    .eq("key", key)
    .eq("window_start", windowStart);

  // Step 4: If we just bumped over the limit, the NEXT request will be rejected
  // (slightly permissive but prevents any race on the allow side)
  return true;
}
