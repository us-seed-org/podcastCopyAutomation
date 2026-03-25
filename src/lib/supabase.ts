import { createClient } from "@supabase/supabase-js";
import type { Conversation, ChatMessage } from "@/types/chat";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — database logging disabled"
  );
}

export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;

export async function getOrCreateConversation(runId: string): Promise<Conversation | null> {
  if (!supabase) return null;
  try {
    const { data: existing } = await supabase
      .from("conversations")
      .select("*")
      .eq("run_id", runId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (existing) return existing as Conversation;

    const { data: created, error } = await supabase
      .from("conversations")
      .insert({ run_id: runId, messages: [], status: "active" })
      .select("*")
      .single();

    if (error) {
      // 23505 = unique_violation — a concurrent request created the conversation first
      if (error.code === "23505") {
        const { data: raced, error: racedError } = await supabase
          .from("conversations")
          .select("*")
          .eq("run_id", runId)
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();
        if (racedError) {
          console.warn("[DB] Failed to re-fetch conversation after 23505 race (runId:", runId, "):", racedError.message);
          return null;
        }
        return (raced as Conversation) || null;
      }
      console.warn("[DB] Failed to create conversation:", error.message);
      return null;
    }
    return created as Conversation;
  } catch (err) {
    console.warn("[DB] Error in getOrCreateConversation:", err);
    return null;
  }
}

export async function appendConversationMessage(
  conversationId: string,
  message: ChatMessage
): Promise<void> {
  if (!supabase) return;
  try {
    // Uses a DB function for atomic append — avoids read-modify-write race
    const { error } = await supabase.rpc("append_conversation_message", {
      p_conversation_id: conversationId,
      p_message: message,
    });
    if (error) {
      console.warn("[DB] Failed to append conversation message:", error.message);
    }
  } catch (err) {
    console.warn("[DB] Error in appendConversationMessage:", err);
  }
}

export async function getConversation(conversationId: string): Promise<Conversation | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .single();
    return (data as Conversation) || null;
  } catch (err) {
    console.warn("[DB] Error in getConversation:", err);
    return null;
  }
}
