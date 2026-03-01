import { supabase } from "@/lib/supabase";

export async function GET() {
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  const db = supabase;
  try {
    const { data: runs, error } = await db
      .from("generation_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Batch-fetch title results and model performance for all runs
    const runIds = (runs || []).map((r) => r.id);

    const [titleRes, modelRes] = await Promise.all([
      runIds.length > 0
        ? db
            .from("title_results")
            .select("*")
            .in("run_id", runIds)
            .order("was_selected", { ascending: false })
            .order("score_total", { ascending: false })
        : { data: [], error: null },
      runIds.length > 0
        ? db
            .from("model_performance")
            .select("*")
            .in("run_id", runIds)
        : { data: [], error: null },
    ]);

    if (titleRes.error) {
      console.error("[runs] Failed to fetch title_results:", titleRes.error.message);
    }
    if (modelRes.error) {
      console.error("[runs] Failed to fetch model_performance:", modelRes.error.message);
    }

    const titlesByRun = new Map<string, typeof titleRes.data>();
    for (const tr of titleRes.data || []) {
      const list = titlesByRun.get(tr.run_id) || [];
      list.push(tr);
      titlesByRun.set(tr.run_id, list);
    }
    const modelsByRun = new Map<string, typeof modelRes.data>();
    for (const mp of modelRes.data || []) {
      const list = modelsByRun.get(mp.run_id) || [];
      list.push(mp);
      modelsByRun.set(mp.run_id, list);
    }

    const enrichedRuns = (runs || []).map((run) => ({
      ...run,
      titleResults: titlesByRun.get(run.id) || [],
      modelPerformance: modelsByRun.get(run.id) || [],
    }));

    return Response.json({ runs: enrichedRuns });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch runs";
    return Response.json({ error: message }, { status: 500 });
  }
}
