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

    // For each run, fetch title results and model performance
    const enrichedRuns = await Promise.all(
      (runs || []).map(async (run) => {
        const [titleRes, modelRes] = await Promise.all([
          db
            .from("title_results")
            .select("*")
            .eq("run_id", run.id)
            .order("was_selected", { ascending: false })
            .order("score_total", { ascending: false }),
          db
            .from("model_performance")
            .select("*")
            .eq("run_id", run.id),
        ]);

        if (titleRes.error) {
          console.error(`[runs] Failed to fetch title_results for run ${run.id}:`, titleRes.error.message);
        }
        if (modelRes.error) {
          console.error(`[runs] Failed to fetch model_performance for run ${run.id}:`, modelRes.error.message);
        }

        return {
          ...run,
          titleResults: titleRes.data || [],
          modelPerformance: modelRes.data || [],
        };
      })
    );

    return Response.json({ runs: enrichedRuns });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch runs";
    return Response.json({ error: message }, { status: 500 });
  }
}
