export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: { suggestedActions?: SuggestedAction[]; tokens_used?: number };
  created_at: string;
}

export interface Conversation {
  id: string;
  run_id: string;
  messages: ChatMessage[];
  status: "active" | "closed";
  created_at: string;
  updated_at: string;
}

export interface SuggestedAction {
  type: "regenerate" | "rescore" | "rerank" | "recontent";
  description: string;
  parameters: Record<string, unknown>;
}

export interface ConversationAction {
  id: string;
  conversation_id: string;
  action_type: SuggestedAction["type"];
  parameters?: Record<string, unknown>;
  triggered_by_message_index?: number;
  status: "pending" | "in_progress" | "completed" | "failed";
  result?: unknown;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}
