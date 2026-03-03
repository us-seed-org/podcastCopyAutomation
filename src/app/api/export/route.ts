import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  if (!runId) {
    return Response.json({ error: "runId query parameter is required" }, { status: 400 });
  }

  try {
    const [runRes, titlesRes] = await Promise.all([
      supabase.from("generation_runs").select("*").eq("id", runId).single(),
      supabase
        .from("title_results")
        .select("*")
        .eq("run_id", runId)
        .eq("was_selected", true)
        .order("score_total", { ascending: false }),
    ]);

    if (runRes.error) {
      return Response.json({ error: `Run not found: ${runRes.error.message}` }, { status: 404 });
    }

    const run = runRes.data;
    const titles = titlesRes.data || [];

    const youtubeTitles = titles.filter((t) => t.platform === "youtube");
    const spotifyTitles = titles.filter((t) => t.platform === "spotify");

    const copySheet = {
      runId: run.id,
      createdAt: run.created_at,
      guestName: run.guest_name,
      podcastName: run.podcast_name,
      youtube: youtubeTitles.map((t) => ({
        title: t.title,
        thumbnailText: t.thumbnail_text || null,
        score: t.score_total,
        archetype: t.archetype || null,
        thumbnailArchetype: t.thumbnail_archetype || null,
        pairwiseRank: t.pairwise_rank || null,
        sourceModel: t.source_model || null,
      })),
      spotify: spotifyTitles.map((t) => ({
        title: t.title,
        score: t.score_total,
        archetype: t.archetype || null,
        sourceModel: t.source_model || null,
      })),
      youtubeDescription: run.youtube_description || null,
      spotifyDescription: run.spotify_description || null,
      chapters: run.chapters || null,
      seoKeywords: run.seo_keywords || null,
    };

    return Response.json(copySheet);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to export run";
    return Response.json({ error: message }, { status: 500 });
  }
}
