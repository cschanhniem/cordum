import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ToolCallCard } from "./ToolCallCard";
import { ApprovalInlinePrompt } from "./ApprovalInlinePrompt";
import type { ChatAssistantMessage } from "@/types/chatAssistant";

interface ChatStreamProps {
  messages: ChatAssistantMessage[];
  emptyHint?: string;
  onSuggestionClick?: (text: string) => void;
}

const EMPTY_SUGGESTIONS: readonly string[] = [
  "List my running jobs",
  "Show recent failures",
  "Submit a $40 mock-bank transfer",
];

export function ChatStream({ messages, emptyHint, onSuggestionClick }: ChatStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastTextLengthRef = useRef(0);

  const tail = messages[messages.length - 1];
  const tailText = tail?.text ?? "";

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    if (lastTextLengthRef.current === tailText.length && messages.length === 0) return;
    lastTextLengthRef.current = tailText.length;
    node.scrollTop = node.scrollHeight;
  }, [messages, tailText]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <div className="font-display text-base font-semibold text-foreground">Ask Cordum</div>
        <p className="mt-2 max-w-[28ch] text-xs text-muted-foreground/80">
          {emptyHint ??
            "Pick a suggestion below or ask anything. Mutating actions still go through approvals."}
        </p>
        <ul
          className="mt-4 flex w-full max-w-[18rem] flex-col gap-2"
          aria-label="Suggested prompts"
        >
          {EMPTY_SUGGESTIONS.map((text) => (
            <li key={text}>
              <button
                type="button"
                onClick={onSuggestionClick ? () => onSuggestionClick(text) : undefined}
                disabled={!onSuggestionClick}
                className="w-full rounded-xl border border-border/60 bg-surface-1/60 px-3 py-2 text-left text-xs text-foreground/90 transition-colors hover:border-cordum/40 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border/60 disabled:hover:bg-surface-1/60"
              >
                {text}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-3 py-3">
      <div className="space-y-3">
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatAssistantMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
          isUser
            ? "bg-cordum/10 text-foreground border border-cordum/20"
            : "bg-surface-1 text-foreground border border-border",
        )}
      >
        {message.text || (isUser ? "" : "…")}
      </div>
      {!isUser && message.toolCalls.length > 0 && (
        <div className="w-full max-w-[85%]">
          {message.toolCalls.map((tc) => (
            <div key={tc.toolCallId}>
              <ToolCallCard toolCall={tc} />
              <ApprovalInlinePrompt toolCall={tc} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
