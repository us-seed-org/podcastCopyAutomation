import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  if (!runId) {
    return Response.json({ error: "Missing runId parameter" }, { status: 400 });
  }

  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const { data: run, error } = await supabase
      .from("generation_runs")
      .select("status, output_json, pipeline_summary")
      .eq("id", runId)
      .single();

    if (error || !run) {
      return Response.json({ error: "Run not found" }, { status: 404 });
    }

    return Response.json({
      status: run.status,
      output: run.output_json,
      summary: run.pipeline_summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Status check failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
