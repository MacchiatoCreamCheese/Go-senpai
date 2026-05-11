import { useCallback, useEffect, useRef, useState } from "react";
import { coachPresetLabel } from "../constants/coachModes";
import { api } from "../lib/http";

export interface ChatMessage {
  role: "user" | "assistant";
  mode: string;
  text: string;
  streaming?: boolean;
  /** When set, this user bubble is a saved strategy note for this move (no AI invoke). */
  strategyNoteMove?: number;
}

export interface OwnershipData {
  data: number[];
  boardSize: number;
}

export function useChatStream(gameId: string, userId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ownership, setOwnership] = useState<OwnershipData | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    setMessages([]);
    setSessionId(null);
    setIsStreaming(false);
    setOwnership(null);
  }, [gameId]);

  const appendStrategyNote = useCallback((moveNumber: number, body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        mode: "strategy_note",
        text: trimmed,
        strategyNoteMove: moveNumber,
      },
    ]);
  }, []);

  const send = useCallback(
    async (mode: string, userInput?: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const trimmedInput = userInput?.trim();
      if (trimmedInput) {
        setMessages((prev) => [...prev, { role: "user", mode, text: trimmedInput }]);
      } else {
        const presetText = coachPresetLabel(mode);
        if (presetText) {
          setMessages((prev) => [...prev, { role: "user", mode, text: presetText }]);
        }
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", mode, text: "", streaming: true },
      ]);
      setIsStreaming(true);
      // Clear previous ownership when starting a new invoke
      if (mode !== "followup") setOwnership(null);

      try {
        const resp = await api(`/api/games/${gameId}/coach/invoke`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            mode,
            user_input: userInput ?? null,
            session_id: sessionId,
          }),
          signal: controller.signal,
        });

        if (!resp.ok || !resp.body) {
          throw new Error(`${resp.status} ${resp.statusText}`);
        }

        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let buf = "";

        outer: while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let msg: { type: string; [k: string]: unknown };
            try {
              msg = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            if (msg.type === "session") {
              setSessionId(msg.session_id as string);
            } else if (msg.type === "ownership") {
              setOwnership({
                data: msg.data as number[],
                boardSize: msg.board_size as number,
              });
            } else if (msg.type === "token") {
              const content = msg.content as string;
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === "assistant") {
                  updated[updated.length - 1] = {
                    ...last,
                    text: last.text + content,
                  };
                }
                return updated;
              });
            } else if (msg.type === "done" || msg.type === "error") {
              if (msg.type === "error") {
                const errMsg = (msg.message as string) || "Something went wrong.";
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last?.streaming) {
                    updated[updated.length - 1] = {
                      ...last,
                      text: last.text || errMsg,
                      streaming: false,
                    };
                  }
                  return updated;
                });
              }
              break outer;
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.streaming) {
              updated[updated.length - 1] = {
                ...last,
                text: last.text || "Error — please try again.",
                streaming: false,
              };
            }
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
        );
      }
    },
    [gameId, userId, sessionId],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setSessionId(null);
    setIsStreaming(false);
    setOwnership(null);
  }, []);

  return { messages, isStreaming, ownership, send, reset, appendStrategyNote };
}
