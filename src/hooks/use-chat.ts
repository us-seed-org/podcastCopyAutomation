"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessage, SuggestedAction } from "@/types/chat";

interface UseChatOptions {
  runId: string | null;
}

interface ChatState {
  messages: ChatMessage[];
  conversationId: string | null;
  pending: boolean;
  error: string | null;
}

export function useChat({ runId }: UseChatOptions) {
  const [state, setState] = useState<ChatState>({
    messages: [],
    conversationId: null,
    pending: false,
    error: null,
  });
  const pendingMsgIdRef = useRef<string | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!runId || !content.trim() || state.pending) return;

      const tempId = crypto.randomUUID();
      pendingMsgIdRef.current = tempId;

      const userMsg: ChatMessage = {
        id: tempId,
        role: "user",
        content: content.trim(),
        created_at: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMsg],
        pending: true,
        error: null,
      }));

      const assistantTempId = crypto.randomUUID();
      const assistantMsg: ChatMessage = {
        id: assistantTempId,
        role: "assistant",
        content: "",
        created_at: new Date().toISOString(),
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, assistantMsg],
      }));

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId,
            message: content.trim(),
            conversationId: state.conversationId,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(err.error || "Chat request failed");
        }

        const convId = res.headers.get("X-Conversation-Id");
        if (convId) {
          setState((prev) => ({ ...prev, conversationId: convId }));
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            accumulated += chunk;
            setState((prev) => ({
              ...prev,
              messages: prev.messages.map((m) =>
                m.id === assistantTempId ? { ...m, content: accumulated } : m
              ),
            }));
          }
        }

        // Parse any suggested actions from final content
        const actions = extractSuggestedActions(accumulated);
        setState((prev) => ({
          ...prev,
          pending: false,
          messages: prev.messages.map((m) =>
            m.id === assistantTempId
              ? {
                  ...m,
                  content: accumulated,
                  metadata: actions.length > 0 ? { suggestedActions: actions } : undefined,
                }
              : m
          ),
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        // Rollback optimistic messages
        setState((prev) => ({
          ...prev,
          pending: false,
          error: msg,
          messages: prev.messages.filter(
            (m) => m.id !== tempId && m.id !== assistantTempId
          ),
        }));
      }
    },
    [runId, state.pending, state.conversationId]
  );

  const confirmAction = useCallback(
    async (action: SuggestedAction, messageIndex?: number) => {
      if (!state.conversationId) return;

      try {
        const res = await fetch("/api/chat/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: state.conversationId,
            actionType: action.type,
            parameters: action.parameters,
            messageIndex,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Action failed" }));
          setState((prev) => ({ ...prev, error: err.error || "Action failed" }));
          return null;
        }

        return await res.json();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setState((prev) => ({ ...prev, error: msg }));
        return null;
      }
    },
    [state.conversationId]
  );

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    messages: state.messages,
    conversationId: state.conversationId,
    pending: state.pending,
    error: state.error,
    sendMessage,
    confirmAction,
    clearError,
  };
}

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
