import { z } from "zod";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

const channelConfigSchema = z.object({
  name: z.string().min(1).max(100),
  system_prompt: z.string().min(1).max(4000),
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

export async function GET() {
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }
  const { data, error } = await supabase
    .from("channel_configs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ data });
}

export async function POST(request: Request) {
  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = channelConfigSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("channel_configs")
    .insert({
      name: parsed.data.name,
      system_prompt: parsed.data.system_prompt,
      voice_guidelines: parsed.data.voice_guidelines ?? {},
      banned_phrases: parsed.data.banned_phrases ?? [],
      preferred_archetypes: parsed.data.preferred_archetypes ?? [],
    })
    .select("*")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ data }, { status: 201 });
}
