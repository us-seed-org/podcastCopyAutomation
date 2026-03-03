import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  const format = searchParams.get("format") || "json";

  if (!runId) {
    return Response.json({ error: "runId query parameter is required" }, { status: 400 });
  }

  try {
    const [runRes, selectedRes, rejectedRes] = await Promise.all([
      supabase.from("generation_runs").select("*").eq("id", runId).single(),
      supabase
        .from("title_results")
        .select("*")
        .eq("run_id", runId)
        .eq("was_selected", true)
        .order("score_total", { ascending: false }),
      supabase
        .from("title_results")
        .select("title, platform, score_total, rejection_reason, source_model, human_rating, human_notes")
        .eq("run_id", runId)
        .eq("was_selected", false)
        .order("score_total", { ascending: false }),
    ]);

    if (runRes.error) {
      return Response.json({ error: `Run not found: ${runRes.error.message}` }, { status: 404 });
    }

    const run = runRes.data;
    const titles = selectedRes.data || [];
    const rejected = rejectedRes.data || [];

    const youtubeTitles = titles.filter((t) => t.platform === "youtube");
    const spotifyTitles = titles.filter((t) => t.platform === "spotify");

    const copySheet = {
      runId: run.id,
      createdAt: run.created_at,
      guestName: run.guest_name,
      podcastName: run.podcast_name,
      pipelineSummary: run.pipeline_summary || null,
      youtube: youtubeTitles.map((t) => ({
        title: t.title,
        thumbnailText: t.thumbnail_text || null,
        score: t.score_total,
        archetype: t.archetype || null,
        thumbnailArchetype: t.thumbnail_archetype || null,
        pairwiseRank: t.pairwise_rank || null,
        sourceModel: t.source_model || null,
        humanRating: t.human_rating || null,
        humanNotes: t.human_notes || null,
      })),
      spotify: spotifyTitles.map((t) => ({
        title: t.title,
        score: t.score_total,
        archetype: t.archetype || null,
        sourceModel: t.source_model || null,
        humanRating: t.human_rating || null,
        humanNotes: t.human_notes || null,
      })),
      rejected: rejected.map((t) => ({
        title: t.title,
        platform: t.platform,
        score: t.score_total,
        reason: t.rejection_reason || null,
        sourceModel: t.source_model || null,
      })),
      youtubeDescription: run.youtube_description || null,
      spotifyDescription: run.spotify_description || null,
      chapters: run.chapters || null,
      seoKeywords: run.seo_keywords || null,
    };

    if (format === "csv") {
      const allTitles = [
        ...youtubeTitles.map((t) => ({
          platform: "youtube",
          title: t.title,
          thumbnailText: t.thumbnail_text || "",
          score: t.score_total || "",
          pairwiseRank: t.pairwise_rank || "",
          sourceModel: t.source_model || "",
          humanRating: t.human_rating || "",
          humanNotes: t.human_notes || "",
          selected: "true",
        })),
        ...spotifyTitles.map((t) => ({
          platform: "spotify",
          title: t.title,
          thumbnailText: "",
          score: t.score_total || "",
          pairwiseRank: "",
          sourceModel: t.source_model || "",
          humanRating: t.human_rating || "",
          humanNotes: t.human_notes || "",
          selected: "true",
        })),
        ...rejected.map((t) => ({
          platform: t.platform || "",
          title: t.title,
          thumbnailText: "",
          score: t.score_total || "",
          pairwiseRank: "",
          sourceModel: t.source_model || "",
          humanRating: t.human_rating || "",
          humanNotes: t.human_notes || "",
          selected: "false",
        })),
      ];

      const headers = ["platform", "title", "thumbnailText", "score", "pairwiseRank", "sourceModel", "humanRating", "humanNotes", "selected"];
      const csvRows = [
        headers.join(","),
        ...allTitles.map((row) =>
          headers.map((h) => `"${String((row as Record<string, unknown>)[h] || "").replace(/"/g, '""')}"`).join(",")
        ),
      ];

      const safeRunId = runId.replace(/[^a-zA-Z0-9_-]/g, "_");
      return new Response(csvRows.join("\n"), {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="copy-sheet-${safeRunId}.csv"`,
        },
      });
    }

    if (format === "markdown") {
      const lines: string[] = [];
      lines.push(`# Copy Sheet — ${run.guest_name} on ${run.podcast_name}`);
      lines.push(`**Generated**: ${run.created_at}  |  **Run ID**: ${run.id}`);
      lines.push("");

      if (youtubeTitles.length > 0) {
        lines.push("## YouTube Titles");
        youtubeTitles.forEach((t, i) => {
          lines.push(`### ${i + 1}. ${t.title} (Score: ${t.score_total ?? "N/A"}/100)`);
          if (t.thumbnail_text) lines.push(`- **Thumbnail**: ${t.thumbnail_text}`);
          if (t.archetype || t.thumbnail_archetype) {
            lines.push(`- **Archetype**: ${t.archetype || "N/A"} | **Thumbnail Archetype**: ${t.thumbnail_archetype || "N/A"}`);
          }
          if (t.pairwise_rank) lines.push(`- **Pairwise Rank**: #${t.pairwise_rank}`);
          if (t.source_model) lines.push(`- **Model**: ${t.source_model}`);
          if (t.human_rating) {
            const safeRating = Math.round(Math.min(5, Math.max(0, t.human_rating)));
            lines.push(`- **Human Rating**: ${"★".repeat(safeRating)}${"☆".repeat(5 - safeRating)} (${safeRating}/5)`);
          }
          if (t.human_notes) lines.push(`- **Notes**: ${t.human_notes}`);
          lines.push("");
        });
      }

      if (spotifyTitles.length > 0) {
        lines.push("## Spotify Titles");
        spotifyTitles.forEach((t, i) => {
          lines.push(`### ${i + 1}. ${t.title} (Score: ${t.score_total ?? "N/A"}/100)`);
          if (t.archetype) lines.push(`- **Archetype**: ${t.archetype}`);
          if (t.source_model) lines.push(`- **Model**: ${t.source_model}`);
          if (t.human_rating) {
            const safeRating = Math.round(Math.min(5, Math.max(0, t.human_rating)));
            lines.push(`- **Human Rating**: ${"★".repeat(safeRating)}${"☆".repeat(5 - safeRating)} (${safeRating}/5)`);
          }
          if (t.human_notes) lines.push(`- **Notes**: ${t.human_notes}`);
          lines.push("");
        });
      }

      if (run.youtube_description || run.spotify_description) {
        lines.push("## Descriptions");
        if (run.youtube_description) {
          lines.push("### YouTube Description");
          lines.push(run.youtube_description);
          lines.push("");
        }
        if (run.spotify_description) {
          lines.push("### Spotify Description");
          lines.push(run.spotify_description);
          lines.push("");
        }
      }

      if (run.chapters) {
        lines.push("## Chapters");
        lines.push(typeof run.chapters === "string" ? run.chapters : JSON.stringify(run.chapters, null, 2));
        lines.push("");
      }

      if (run.pipeline_summary) {
        let ps: any = null;
        try {
          ps = typeof run.pipeline_summary === "string" ? JSON.parse(run.pipeline_summary) : run.pipeline_summary;
        } catch {
          // Malformed JSON — skip pipeline summary section
        }
        if (ps) {
          lines.push("## Pipeline Summary");
          lines.push(`- Generated: ${ps.totalGenerated ?? "N/A"} | Selected: ${ps.totalSelected ?? "N/A"} | Rewrite Rate: ${ps.rewriteRate ?? "N/A"}%`);
          lines.push(`- Duration: ${ps.totalDurationMs ?? "N/A"}ms`);
          if (ps.weakDimensions?.length > 0) {
            lines.push(`- Weak Dimensions: ${ps.weakDimensions.map((d: any) => d.dimension).join(", ")}`);
          }
          lines.push("");
        }
      }

      const safeRunIdMd = runId.replace(/[^a-zA-Z0-9_-]/g, "_");
      return new Response(lines.join("\n"), {
        headers: {
          "Content-Type": "text/markdown",
          "Content-Disposition": `attachment; filename="copy-sheet-${safeRunIdMd}.md"`,
        },
      });
    }

    return Response.json(copySheet);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to export run";
    return Response.json({ error: message }, { status: 500 });
  }
}
