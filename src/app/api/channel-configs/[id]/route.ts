import { z } from "zod";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  system_prompt: z.string().min(1).max(4000).optional(),
  voice_guidelines: z
    .object({
      tone: z.string().max(200).optional(),
      style: z.string().max(200).optional(),
      personality: z.string().max(200).optional(),
    })
    .optional(),
  banned_phrases: z.array(z.string().max(100)).max(20).optional(),
  preferred_archetypes: z
    .array(z.enum(["authority_shocking", "mechanism_outcome", "curiosity_gap", "negative_contrarian"]))
    .max(4)
    .optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }
  const { id } = await params;
  const { data, error } = await supabase
    .from("channel_configs")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ error: "Database error" }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ data });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("channel_configs")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return Response.json({ error: "A config with this name already exists" }, { status: 409 });
    }
    return Response.json({ error: error?.message || "Not found" }, { status: 404 });
  }
  return Response.json({ data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }
  const { id } = await params;
  const { error } = await supabase.from("channel_configs").delete().eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
