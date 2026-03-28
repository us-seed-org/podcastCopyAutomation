"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Send, Loader2, MessageSquare, AlertCircle } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import type { SuggestedAction } from "@/types/chat";
import { ActionConfirmModal } from "@/components/action-confirm-modal";

interface ChatPanelProps {
  runId: string;
}

const ACTION_LABELS: Record<SuggestedAction["type"], string> = {
  regenerate: "Re-generate titles",
  rescore: "Re-score titles",
  rerank: "Re-rank titles",
  recontent: "Re-generate content",
};

export function ChatPanel({ runId }: ChatPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [input, setInput] = useState("");
  const [pendingAction, setPendingAction] = useState<{ action: SuggestedAction; messageIndex: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, pending, error, sendMessage, confirmAction, clearError } = useChat({ runId });

  useEffect(() => {
    if (!collapsed) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, collapsed]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || pending) return;
    setInput("");
    await sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleActionClick = (action: SuggestedAction, messageIndex: number) => {
    setPendingAction({ action, messageIndex });
  };

  const handleActionConfirm = async () => {
    if (!pendingAction) return;
    setPendingAction(null);
    await confirmAction(pendingAction.action, pendingAction.messageIndex);
  };

  return (
    <>
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Refinement Chat</CardTitle>
              {messages.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {messages.filter((m) => m.role === "user").length} message
                  {messages.filter((m) => m.role === "user").length !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>

        {!collapsed && (
          <CardContent className="pt-0">
            {/* Message thread */}
            <div className="min-h-[120px] max-h-[400px] overflow-y-auto space-y-3 mb-3 pr-1">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Ask about your titles, scores, or request changes. E.g. &quot;Why did the first title score highest?&quot; or &quot;Make the titles more urgent.&quot;
                </p>
              )}

              {messages.map((msg, i) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="whitespace-pre-wrap">
                        {/* Strip action blocks from display */}
                        {msg.content.replace(/```action[\s\S]*?```/g, "").trim()}
                        {/* Suggested action buttons */}
                        {msg.metadata?.suggestedActions && msg.metadata.suggestedActions.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5 pt-1 border-t border-border/50">
                            {msg.metadata.suggestedActions.map((action, ai) => (
                              <Button
                                key={ai}
                                size="sm"
                                variant="secondary"
                                className="h-7 text-xs"
                                onClick={() => handleActionClick(action, i)}
                              >
                                {action.description || ACTION_LABELS[action.type]}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span>{msg.content}</span>
                    )}
                    {msg.role === "assistant" && !msg.content && pending && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                  </div>
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive mb-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
                <Button variant="ghost" size="sm" className="h-6 text-xs ml-auto" onClick={clearError}>
                  Dismiss
                </Button>
              </div>
            )}

            {/* Input */}
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                className="flex-1 min-h-[40px] max-h-[120px] resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Ask about your results or request changes..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={pending}
                rows={1}
              />
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!input.trim() || pending}
                className="self-end"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Press Enter to send, Shift+Enter for newline
            </p>
          </CardContent>
        )}
      </Card>

      {pendingAction && (
        <ActionConfirmModal
          action={pendingAction.action}
          onConfirm={handleActionConfirm}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </>
  );
}
