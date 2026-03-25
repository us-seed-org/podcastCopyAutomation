import { supabase } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_ACTION_TYPES = ["regenerate", "rescore", "rerank", "recontent"] as const;
type ActionType = (typeof VALID_ACTION_TYPES)[number];

function mapActionToMode(actionType: ActionType): string {
  if (actionType === "regenerate") return "regenerate_title";
  return actionType;
}

export async function POST(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    (forwarded ? forwarded.split(",")[0].trim() : null) ||
    request.headers.get("x-real-ip") ||
    "anonymous";
  if (!checkRateLimit(`chat-action:${ip}`, 5, 3_600_000)) {
    return Response.json({ error: "Action rate limit exceeded. Try again later." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return Response.json({ error: "Request body must be a JSON object" }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const conversationId = typeof raw.conversationId === "string" ? raw.conversationId : undefined;
  const actionType = typeof raw.actionType === "string" ? raw.actionType : undefined;
  const messageIndex =
    typeof raw.messageIndex === "number" ? raw.messageIndex : undefined;
  const parameters: Record<string, unknown> =
    raw.parameters !== null &&
    typeof raw.parameters === "object" &&
    !Array.isArray(raw.parameters)
      ? (raw.parameters as Record<string, unknown>)
      : {};

  if (!conversationId || !actionType) {
    return Response.json({ error: "conversationId and actionType are required" }, { status: 400 });
  }

  if (!VALID_ACTION_TYPES.includes(actionType as ActionType)) {
    return Response.json(
      { error: `Invalid actionType. Expected one of: ${VALID_ACTION_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  // Validate conversation exists and is active
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, run_id, status")
    .eq("id", conversationId)
    .single();

  if (!conv || conv.status !== "active") {
    return Response.json({ error: "Conversation not found or not active" }, { status: 404 });
  }

  // Prevent double-trigger: check for in_progress actions
  const { data: inProgress } = await supabase
    .from("conversation_actions")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("status", "in_progress")
    .limit(1)
    .single();

  if (inProgress) {
    return Response.json({ error: "An action is already in progress for this conversation" }, { status: 409 });
  }

  // Insert action record
  const { data: actionRow, error: insertErr } = await supabase
    .from("conversation_actions")
    .insert({
      conversation_id: conversationId,
      action_type: actionType,
      parameters,
      triggered_by_message_index: messageIndex ?? null,
      status: "in_progress",
    })
    .select("id")
    .single();

  if (insertErr || !actionRow) {
    return Response.json({ error: "Failed to create action record" }, { status: 500 });
  }

  const actionId = actionRow.id;

  // Fetch run data for pipeline call
  const { data: run } = await supabase
    .from("generation_runs")
    .select("id, output_json, research_json, transcript_text, episode_description, channel_config_id")
    .eq("id", conv.run_id)
    .single();

  if (!run) {
    await supabase
      .from("conversation_actions")
      .update({ status: "failed", error_message: "Run not found", completed_at: new Date().toISOString() })
      .eq("id", actionId);
    return Response.json({ error: "Associated run not found" }, { status: 404 });
  }

  if (!run.research_json || !run.transcript_text || !run.episode_description) {
    await supabase
      .from("conversation_actions")
      .update({ status: "failed", error_message: "Run missing input data (research_json/transcript_text)", completed_at: new Date().toISOString() })
      .eq("id", actionId);
    return Response.json({ error: "Run was created before input storage was supported. Re-run a full generation to enable chat actions." }, { status: 422 });
  }

  const mode = mapActionToMode(actionType as ActionType);
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  // Fire-and-forget: call /api/generate in background, don't await
  const generatePayload: Record<string, unknown> = {
    research: run.research_json,
    transcript: run.transcript_text,
    episodeDescription: run.episode_description,
    mode,
    existingGeneration: run.output_json,
    ...(run.channel_config_id ? { channelConfigId: run.channel_config_id } : {}),
  };

  if (actionType === "regenerate" && parameters.archetype) {
    generatePayload.targetArchetype = parameters.archetype;
  }

  // Execute asynchronously
  (async () => {
    try {
      const res = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(generatePayload),
      });

      if (!res.ok) {
        throw new Error(`Generate returned ${res.status}`);
      }

      // Drain the stream
      const reader = res.body?.getReader();
      if (reader) {
        try {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        } catch (readErr) {
          reader.cancel().catch(() => undefined);
          throw readErr;
        }
      }

      await supabase!
        .from("conversation_actions")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", actionId);
    } catch (err) {
      await supabase!
        .from("conversation_actions")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : String(err),
          completed_at: new Date().toISOString(),
        })
        .eq("id", actionId);
    }
  })();

  return Response.json({ actionId, status: "in_progress" }, { status: 202 });
}
