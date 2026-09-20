"use client";

import { useEffect, useRef, useState } from "react";
import { Chip, ErrorCard, Icon, ThinkingLine } from "./Primitives";
import type { AppliedOp } from "@/lib/schemas";
import type { LLMErrorShape } from "@/lib/client";

export type Message =
  | { id: string; role: "recruiter"; text: string }
  | { id: string; role: "assistant"; kind: "note"; text: string }
  | { id: string; role: "assistant"; kind: "diff"; text: string; applied: AppliedOp[] }
  | { id: string; role: "assistant"; kind: "error"; error: LLMErrorShape };

/** The changelog. Rendering it is free because refinement returns a diff. */
function DiffCard({ text, applied }: { text: string; applied: AppliedOp[] }) {
  return (
    <div className="rise border border-rule bg-panel">
      <p className="border-b border-rule-2 px-3 py-2.5 text-[12.5px] leading-[1.55] text-ink">{text}</p>

      {applied.length === 0 && (
        <p className="px-3 py-2.5 text-[12px] leading-relaxed text-ink-3">
          Nothing changed — the search already reflects that. Try being more specific about what was wrong.
        </p>
      )}

      {applied.map((a, i) => (
        <div key={i} className={`border-b border-rule-2 px-3 py-2.5 last:border-b-0 ${a.skipped ? "opacity-60" : ""}`}>
          <div className="flex items-start gap-2">
            <Chip tone={a.skipped ? "weak" : a.target === "filter" ? "accent" : "possible"}>
              {a.skipped ? "skipped" : a.target}
            </Chip>
            <span className="mt-[2px] text-[12px] font-semibold leading-snug text-ink">{a.label}</span>
          </div>
          <p className="mt-1.5 text-[11.5px] leading-[1.55] text-ink-2">{a.reason}</p>
        </div>
      ))}
    </div>
  );
}

export function ChatPanel({
  messages,
  busy,
  busyLabel,
  pending,
  onClearPending,
  onSend,
  onFreeze,
  canFreeze,
  onRetry,
}: {
  messages: Message[];
  busy: boolean;
  busyLabel: string;
  pending: { yes: number; no: number };
  onClearPending: () => void;
  onSend: (text: string) => void;
  onFreeze: () => void;
  canFreeze: boolean;
  onRetry: () => void;
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const queued = pending.yes + pending.no;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  const send = () => {
    const text = draft.trim();
    if (!text && !queued) return;
    onSend(text || "Use the match and not-a-match marks I just made on the profiles.");
    setDraft("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) =>
          m.role === "recruiter" ? (
            <div key={m.id} className="rise border-l-2 border-ink pl-3">
              <span className="micro text-ink-3">You</span>
              <p className="mt-1 text-[12.5px] leading-[1.55] text-ink">{m.text}</p>
            </div>
          ) : m.kind === "note" ? (
            <p key={m.id} className="rise text-[12.5px] leading-[1.6] text-ink-2">
              {m.text}
            </p>
          ) : m.kind === "diff" ? (
            <DiffCard key={m.id} text={m.text} applied={m.applied} />
          ) : (
            <ErrorCard key={m.id} error={m.error} onRetry={onRetry} compact />
          ),
        )}

        {busy && (
          <div className="py-1">
            <ThinkingLine label={busyLabel} />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-ink bg-panel p-3">
        {queued > 0 && (
          <div className="mb-2 flex items-center justify-between gap-2 border border-accent/30 bg-accent-soft px-2.5 py-1.5">
            <span className="micro text-accent-ink">
              {pending.yes > 0 && `${pending.yes} match`}
              {pending.yes > 0 && pending.no > 0 && " · "}
              {pending.no > 0 && `${pending.no} rejected`}
            </span>
            <button onClick={onClearPending} className="micro cursor-pointer text-accent-ink/60 hover:text-accent-ink">
              clear
            </button>
          </div>
        )}

        <div className="border border-rule bg-paper transition focus-within:border-accent">
          <textarea
            value={draft}
            rows={2}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={queued > 0 ? "Add why, or just send the marks…" : "1 is too junior, 2 and 4 are right…"}
            className="w-full resize-none bg-transparent px-3 py-2.5 text-[12.5px] leading-[1.55] text-ink placeholder:text-ink-3/60 focus:outline-none disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-2 border-t border-rule-2 px-2 py-2">
            <button
              onClick={onFreeze}
              disabled={!canFreeze || busy}
              className="micro inline-flex cursor-pointer items-center gap-1.5 border border-rule px-2.5 py-1.5 text-ink-2 transition hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Icon.Freeze className="h-3 w-3" />
              Freeze
            </button>
            <button
              onClick={send}
              disabled={busy || (!draft.trim() && !queued)}
              className="micro inline-flex cursor-pointer items-center gap-1.5 bg-accent px-3 py-1.5 text-white transition hover:bg-accent-ink disabled:cursor-not-allowed disabled:opacity-30"
            >
              Refine
              <Icon.Arrow className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
