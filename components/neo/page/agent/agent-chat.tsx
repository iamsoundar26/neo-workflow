import React, { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import NeoMark from "@/components/neo/common/neo-mark";
import type { Quick } from "@/config/pages/neo/agent-nodes";
import { cn } from "@/lib/utils";

export type ChatMsg = { id: number; from: "you" | "neo"; text: string; undoable?: boolean };

type Props = {
  name: string;
  quick: Quick[];
  messages: ChatMsg[];
  onSend: (text: string) => void;
  onQuick: (q: Quick) => void;
  onUndo: (id: number) => void;
};

/**
 * The agent's own chat, beside its workflow (the Korefi pattern): say what it
 * should do differently, in your own words or with a tap, and the node that
 * changes shows it. Every change can be undone, here or from the bar above.
 */
const AgentChat = ({ name, quick, messages, onSend, onQuick, onUndo }: Props) => {
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };
  return (
    <aside aria-label={`Talk to ${name}`} className="flex min-h-0 w-full flex-1 flex-col bg-background" data-testid="agent-chat">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        {messages.length === 0 ? (
          <div className="grid h-full min-h-[260px] place-content-center text-center">
            <NeoMark className="mx-auto h-11 w-11 rounded-xl" />
            <h2 className="mt-3 text-[14px] font-semibold leading-5 text-pi-ink">What should {name} do differently?</h2>
            <p className="mt-1 text-[13px] leading-5 text-pi-body [text-wrap:pretty]">
              Tell me in your own words, or edit it on the right. I save as I go, and you can undo any change.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3" aria-live="polite">
            {messages.map((m) => (
              <li key={m.id} className={cn("flex gap-2", m.from === "you" && "justify-end")}>
                {m.from === "neo" && <NeoMark className="mt-0.5 h-6 w-6 rounded-md" />}
                <div className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-[14px] leading-5", m.from === "you" ? "bg-pi-brand-tint text-pi-ink" : "bg-background text-pi-ink ring-1 ring-pi-line")}>
                  {m.text}
                  {m.undoable && (
                    <button type="button" onClick={() => onUndo(m.id)} className="ml-2 font-medium text-pi-brand hover:underline" data-testid="chat-undo">
                      Undo
                    </button>
                  )}
                </div>
              </li>
            ))}
            <div ref={end} />
          </ul>
        )}
      </div>
      <div className="flex flex-none flex-col gap-2.5 px-4 pb-3 pt-1">
        <div className="flex flex-wrap gap-1.5">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              data-testid="chat-chip"
              onClick={() => onQuick(q)}
              className="rounded-full border border-pi-line-2 bg-background px-3 py-1.5 text-left text-[13px] text-pi-ink transition-colors hover:bg-pi-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
            >
              {q.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-center gap-2 rounded-2xl border border-pi-line-2 bg-background py-2 pl-4 pr-2 shadow-contact focus-within:ring-2 focus-within:ring-border"
        >
          <input
            aria-label={`Reply to ${name}`}
            data-testid="chat-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Reply to ${name}`}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-pi-ink placeholder:text-pi-faint focus-visible:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            data-testid="chat-send"
            className="grid h-8 w-8 flex-none place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </form>
        <p className="text-center text-[12px] text-pi-faint">Agents prepare. Nothing reaches your books until you approve.</p>
      </div>
    </aside>
  );
};

export default AgentChat;
