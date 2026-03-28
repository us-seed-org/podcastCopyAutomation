import { streamText } from "ai";
import { generationModel } from "@/lib/ai";
import { supabase, getOrCreateConversation, appendConversationMessage } from "@/lib/supabase";
import { chatSystemPrompt } from "@/lib/prompts/chat-system";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ChatMessage, SuggestedAction } from "@/types/chat";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_ACTION_TYPES = new Set(["regenerate", "rescore", "rerank", "recontent"]);

function extractSuggestedActions(text: string): SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  const actionBlockRegex = /```action\n([\s\S]*?)```/g;
  let match;
  while ((match = actionBlockRegex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (
        typeof parsed.type === "string" &&
        VALID_ACTION_TYPES.has(parsed.type) &&
        typeof parsed.description === "string" &&
        parsed.description.length > 0 &&
        (parsed.parameters === undefined ||
          (typeof parsed.parameters === "object" &&
            parsed.parameters !== null &&
            !Array.isArray(parsed.parameters)))
      ) {
        actions.push({
          type: parsed.type as SuggestedAction["type"],
          description: parsed.description,
          parameters: parsed.parameters ?? {},
        });
      }
    } catch {
      // ignore malformed action blocks
    }
  }
  return actions;
}

export async function POST(request: Request) {
  const realIp = request.headers.get("x-real-ip");
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = realIp
    ? (forwarded ? forwarded.split(",")[0].trim() : null) || realIp
    : "anonymous";
  if (!(await checkRateLimit(`chat:${ip}`, 30, 60_000))) {
    return Response.json({ error: "Rate limit exceeded. Try again in a minute." }, { status: 429 });
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
  const runId = typeof raw.runId === "string" ? raw.runId : undefined;
  const message = typeof raw.message === "string" ? raw.message : undefined;
  const conversationId = typeof raw.conversationId === "string" ? raw.conversationId : undefined;

  if (!runId || !message) {
    return Response.json({ error: "runId and message are required" }, { status: 400 });
  }

  if (message.length > 4000) {
    return Response.json({ error: "Message too long (max 4000 chars)" }, { status: 400 });
  }

  if (!supabase) {
    return Response.json({ error: "Database not configured" }, { status: 503 });
  }

  // Validate runId exists
  const { data: run } = await supabase
    .from("generation_runs")
    .select("id, output_json, podcast_name, guest_name, guest_tier, channel_config_id")
    .eq("id", runId)
    .single();

  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  // Get or create conversation
  const conv = conversationId
    ? await (async () => {
        const { data } = await supabase
          .from("conversations")
          .select("*")
          .eq("id", conversationId)
          .eq("run_id", runId)  // scope to this run — prevent cross-run access
          .single();
        return data;
      })()
    : await getOrCreateConversation(runId);

  if (!conv) {
    return Response.json({ error: "Failed to get/create conversation" }, { status: 500 });
  }

  // Fetch channel config if linked
  let channelConfig = null;
  if (run.channel_config_id) {
    const { data: cc } = await supabase
      .from("channel_configs")
      .select("*")
      .eq("id", run.channel_config_id)
      .single();
    channelConfig = cc;
  }

  // Build context from run output
  const outputJson = run.output_json as Record<string, unknown> | null;
  const youtubeTitles = (outputJson?.youtubeTitles as Array<{ title: string; score?: { total?: number }; archetype?: string }>) ?? [];
  const spotifyTitles = (outputJson?.spotifyTitles as Array<{ title: string; score?: { total?: number } }>) ?? [];

  const systemPrompt = chatSystemPrompt({
    podcastName: run.podcast_name,
    guestName: run.guest_name,
    guestTier: run.guest_tier,
    youtubeTitles,
    spotifyTitles,
    scoresJson: youtubeTitles.length > 0 ? youtubeTitles.map(t => ({ title: t.title, score: t.score })).slice(0, 8) : undefined,
    channelConfig,
  });

  // Build message history for context
  const existingMessages = (conv.messages as ChatMessage[]) || [];
  const historyMessages = existingMessages.slice(-20).map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Save user message optimistically
  const userMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: message,
    created_at: new Date().toISOString(),
  };
  await appendConversationMessage(conv.id, userMsg);

  // Stream the response
  const result = streamText({
    model: generationModel(),
    system: systemPrompt,
    messages: [
      ...historyMessages,
      { role: "user", content: message },
    ],
    onFinish: async ({ text }) => {
      const suggestedActions = extractSuggestedActions(text);
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: text,
        metadata: suggestedActions.length > 0 ? { suggestedActions } : undefined,
        created_at: new Date().toISOString(),
      };
      await appendConversationMessage(conv.id, assistantMsg);
    },
  });

  // Return conversationId in header so client can track it
  const stream = result.toTextStreamResponse();
  const responseHeaders = new Headers(stream.headers);
  responseHeaders.set("X-Conversation-Id", conv.id);

  return new Response(stream.body, {
    status: stream.status,
    headers: responseHeaders,
  });
}
