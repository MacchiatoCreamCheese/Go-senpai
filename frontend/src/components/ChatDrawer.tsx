import { useEffect, useRef, useState } from "react";
import { useChatStream } from "../hooks/useChatStream";
import { COACH_PRESET_MODES } from "../constants/coachModes";

interface Props {
  gameId: string;
  userId: string;
  open: boolean;
  onClose: () => void;
  onStreamingChange?: (streaming: boolean) => void;
  onOwnership?: (data: number[], boardSize: number) => void;
}

export function ChatDrawer({ gameId, userId, open, onClose, onStreamingChange, onOwnership }: Props) {
  const { messages, isStreaming, ownership, send, reset } = useChatStream(gameId, userId);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    onStreamingChange?.(isStreaming);
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ownership) onOwnership?.(ownership.data, ownership.boardSize);
  }, [ownership]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!open) {
      reset();
      setInput("");
    } else {
      // Focus input when reopened after first message
      if (hasMessages) setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleMode = (mode: string) => {
    if (isStreaming) return;
    send(mode);
  };

  const handleFollowup = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    send("followup", trimmed);
    setInput("");
  };

  if (!open) return null;

  return (
    <>
      <div className="chat-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <div className="chat-drawer" role="dialog" aria-label="Ask Sensei">
        <div className="chat-drawer-header">
          <span className="chat-drawer-title">Ask Sensei</span>
          <button
            className="chat-drawer-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {isStreaming && <div className="chat-loading-bar" aria-hidden="true" />}

        {!hasMessages && (
          <div className="chat-mode-buttons">
            <p className="chat-mode-hint">What would you like to explore?</p>
            {COACH_PRESET_MODES.map((m) => (
              <button
                key={m.id}
                className="btn chat-mode-btn"
                onClick={() => handleMode(m.id)}
                disabled={isStreaming}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {hasMessages && (
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-message chat-message--${msg.role}`}>
                {msg.streaming && !msg.text ? (
                  <span className="chat-thinking">Thinking…</span>
                ) : (
                  msg.text
                )}
                {msg.streaming && msg.text && (
                  <span className="chat-cursor" aria-hidden="true" />
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}

        {hasMessages && (
          <div className="chat-input-row">
            <input
              ref={inputRef}
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleFollowup();
                }
              }}
              placeholder="Ask a follow-up…"
              disabled={isStreaming}
              aria-label="Follow-up question"
            />
            <button
              className="btn btn-primary"
              onClick={handleFollowup}
              disabled={isStreaming || !input.trim()}
            >
              Send
            </button>
          </div>
        )}
      </div>
    </>
  );
}
