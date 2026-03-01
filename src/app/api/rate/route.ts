import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { titleResultId, humanRating, humanNotes } = body;

    if (!titleResultId) {
      return Response.json({ error: "Missing titleResultId" }, { status: 400 });
    }

    if (humanRating !== undefined && (typeof humanRating !== "number" || !Number.isFinite(humanRating) || humanRating < 1 || humanRating > 5)) {
      return Response.json({ error: "humanRating must be a number between 1 and 5" }, { status: 400 });
    }

    if (humanNotes !== undefined && typeof humanNotes !== "string") {
      return Response.json({ error: "humanNotes must be a string" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (humanRating !== undefined) updates.human_rating = humanRating;
    if (humanNotes !== undefined) updates.human_notes = humanNotes;

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("title_results")
      .update(updates)
      .eq("id", titleResultId)
      .select();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return Response.json({ error: "titleResultId not found" }, { status: 404 });
    }

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save rating";
    return Response.json({ error: message }, { status: 500 });
  }
}
