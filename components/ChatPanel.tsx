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

/** The changelog card. Rendering it is free because refinement returns a diff. */
function DiffCard({ text, applied }: { text: string; applied: AppliedOp[] }) {
  const real = applied.filter((a) => !a.skipped);
  return (
    <div className="rise rounded-xl border border-line bg-panel p-3">
      <p className="text-[12.5px] leading-relaxed text-ink">{text}</p>

      {real.length === 0 && applied.length === 0 && (
        <p className="mt-2 rounded-lg bg-canvas px-2.5 py-2 text-[12px] leading-relaxed text-ink-3">
          Nothing changed — the search already reflects that. Try being more specific about what was wrong.
        </p>
      )}

      {applied.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {applied.map((a, i) => (
            <li
              key={i}
              className={`rounded-lg border px-2.5 py-2 ${
                a.skipped ? "border-dashed border-line bg-canvas" : "border-line bg-canvas"
              }`}
            >
              <div className="flex items-start gap-1.5">
                <Chip tone={a.skipped ? "weak" : a.target === "filter" ? "accent" : "possible"}>
                  {a.skipped ? "skipped" : a.target}
                </Chip>
                <span className="mt-[3px] text-[12px] font-semibold leading-snug text-ink">{a.label}</span>
              </div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-2">{a.reason}</p>
            </li>
          ))}
        </ul>
      )}
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
      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-4 scroll-thin">
        {messages.map((m) =>
          m.role === "recruiter" ? (
            <div key={m.id} className="rise flex justify-end">
              <p className="max-w-[88%] rounded-xl rounded-br-sm bg-accent px-3 py-2 text-[12.5px] leading-relaxed text-white">
                {m.text}
              </p>
            </div>
          ) : m.kind === "note" ? (
            <p key={m.id} className="rise px-0.5 text-[12.5px] leading-relaxed text-ink-2">
              {m.text}
            </p>
          ) : m.kind === "diff" ? (
            <DiffCard key={m.id} text={m.text} applied={m.applied} />
          ) : (
            <ErrorCard key={m.id} error={m.error} onRetry={onRetry} compact />
          ),
        )}

        {busy && (
          <div className="px-0.5 py-1">
            <ThinkingLine label={busyLabel} />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line bg-panel p-3">
        {queued > 0 && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-accent-soft px-2.5 py-1.5">
            <span className="text-[11.5px] font-medium text-accent-ink">
              {pending.yes > 0 && `${pending.yes} marked match`}
              {pending.yes > 0 && pending.no > 0 && " · "}
              {pending.no > 0 && `${pending.no} marked not a match`}
            </span>
            <button onClick={onClearPending} className="text-[11px] text-accent-ink/70 hover:text-accent-ink">
              clear
            </button>
          </div>
        )}

        <div className="rounded-xl border border-line bg-canvas transition focus-within:border-accent/40">
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
            placeholder={
              queued > 0
                ? "Add why, or just send the marks…"
                : "1 is too junior, 2 and 4 are right…"
            }
            className="w-full resize-none bg-transparent px-3 py-2.5 text-[12.5px] leading-relaxed text-ink placeholder:text-ink-3/70 focus:outline-none disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <button
              onClick={onFreeze}
              disabled={!canFreeze || busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink-2 transition hover:border-ink-3/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon.Freeze className="h-3 w-3" />
              Freeze search
            </button>
            <button
              onClick={send}
              disabled={busy || (!draft.trim() && !queued)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-accent-ink disabled:cursor-not-allowed disabled:opacity-35"
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
