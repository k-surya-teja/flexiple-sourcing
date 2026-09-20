"use client";

import { useEffect, useState } from "react";
import type { LLMErrorShape } from "@/lib/client";

/* ─────────────────────────────── Icons ───────────────────────────────
   Drawn on a 16px grid with a consistent 1.4 stroke so they sit at the
   same optical weight as the mono labels they appear beside.          */

export const Icon = {
  Lock: (p: { className?: string }) => (
    <svg viewBox="0 0 16 16" fill="none" className={p.className} aria-hidden>
      <rect x="3.5" y="7" width="9" height="6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.75 7V5.25a2.25 2.25 0 0 1 4.5 0V7" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  Check: (p: { className?: string }) => (
    <svg viewBox="0 0 16 16" fill="none" className={p.className} aria-hidden>
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" />
    </svg>
  ),
  Cross: (p: { className?: string }) => (
    <svg viewBox="0 0 16 16" fill="none" className={p.className} aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  ),
  Arrow: (p: { className?: string }) => (
    <svg viewBox="0 0 16 16" fill="none" className={p.className} aria-hidden>
      <path d="M2.5 8h11M9.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  ),
  ArrowLeft: (p: { className?: string }) => (
    <svg viewBox="0 0 16 16" fill="none" className={p.className} aria-hidden>
      <path d="M13.5 8h-11M6.5 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  ),
  Freeze: (p: { className?: string }) => (
    <svg viewBox="0 0 16 16" fill="none" className={p.className} aria-hidden>
      <path d="M8 1.5v13M2.5 4.5l11 7M13.5 4.5l-11 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
    </svg>
  ),
};

/* ─────────────────────────── Editorial bits ─────────────────────────── */

/** A word sitting on a hairline rule. The section divider of the whole app. */
export function RuleLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <h3 className="micro shrink-0 text-ink-3">{children}</h3>
      <span className="h-px flex-1 bg-rule" />
      {right && <span className="shrink-0">{right}</span>}
    </div>
  );
}

export function Chip({
  children,
  tone = "neutral",
  onRemove,
  title,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "strong" | "possible" | "weak" | "danger";
  onRemove?: () => void;
  title?: string;
}) {
  const tones = {
    neutral: "bg-panel-2 text-ink-2 border-rule",
    accent: "bg-accent-soft text-accent-ink border-accent/25",
    strong: "bg-strong-soft text-strong border-strong/25",
    possible: "bg-possible-soft text-possible border-possible/25",
    weak: "bg-weak-soft text-weak border-rule",
    danger: "bg-danger-soft text-danger border-danger/25",
  }[tone];

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 border px-1.5 py-[2px] font-mono text-[10.5px] font-medium leading-[1.5] tracking-[0.02em] ${tones}`}
    >
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 -mr-0.5 cursor-pointer p-0.5 opacity-40 transition hover:opacity-100"
          aria-label="Remove"
        >
          <Icon.Cross className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

/** 1–5, as filled squares. Reads instantly; editable by clicking. */
export function WeightDots({ weight, onChange }: { weight: number; onChange?: (w: number) => void }) {
  return (
    <span className="inline-flex items-center gap-[3px]" title={`Weight ${weight} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          disabled={!onChange}
          onClick={() => onChange?.(i)}
          aria-label={`Set weight ${i}`}
          className={`h-[7px] w-[7px] transition ${i <= weight ? "bg-accent" : "bg-rule"} ${
            onChange ? "cursor-pointer hover:scale-150" : ""
          }`}
        />
      ))}
    </span>
  );
}

/** Big mono numeral over a measure bar — a score you can read across a page. */
export function ScoreBadge({ score, verdict }: { score: number; verdict: "strong" | "possible" | "weak" }) {
  const tone = { strong: "text-strong", possible: "text-possible", weak: "text-weak" }[verdict];
  const bar = { strong: "bg-strong", possible: "bg-possible", weak: "bg-weak" }[verdict];
  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <div className={`font-mono text-[26px] font-medium leading-none tabular-nums ${tone}`}>{score}</div>
      <div className="h-[2px] w-14 bg-rule">
        <div className={`h-full ${bar}`} style={{ width: `${Math.max(3, score)}%` }} />
      </div>
    </div>
  );
}

/* Contact details are rendered as copyable text rather than anchors: these
   people are fictional, so a live link would land the recruiter on a stranger's
   profile or a 404. Swap the span for an <a> if you load a real dataset. */
export function CopyField({
  label,
  value,
  display,
}: {
  label: string;
  value: string;
  /** Shown on screen when the full value would repeat the label. Copy still
      puts the complete value on the clipboard. */
  display?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard blocked — the value is selectable on screen regardless */
        }
      }}
      title={`Copy ${label}`}
      className="group/copy inline-flex max-w-full cursor-pointer items-baseline gap-1.5 text-left"
    >
      <span className="micro shrink-0 text-ink-3/70">{label}</span>
      <span className="truncate font-mono text-[11px] text-ink-2 underline decoration-rule decoration-dotted underline-offset-[3px] transition group-hover/copy:text-accent group-hover/copy:decoration-accent">
        {copied ? "copied" : (display ?? value)}
      </span>
    </button>
  );
}

/* ───────────────────────── Failure, designed ─────────────────────────
   Every LLM failure mode gets its own sentence and its own next step.
   A generic "something went wrong" toast is the thing being avoided.  */

const ERROR_COPY: Record<LLMErrorShape["kind"], { title: string; hint: string }> = {
  missing_key: {
    title: "No API key configured",
    hint: "Add GROQ_API_KEY to .env.local and restart the dev server. Nothing here works without it.",
  },
  rate_limit: {
    title: "Rate limit reached",
    hint: "The free tier allows 8,000 tokens a minute, then asks for a short wait. Your criteria and results are untouched.",
  },
  timeout: {
    title: "The model took too long",
    hint: "Usually a slow batch rather than a real outage. Retrying often works immediately.",
  },
  upstream: { title: "Groq is unreachable", hint: "The provider returned an error. Your search state is safe." },
  malformed: {
    title: "Unusable response",
    hint: "It failed schema validation twice, including one corrected retry. Nothing was applied.",
  },
  truncated: {
    title: "The model ran out of room",
    hint: "It spent its token budget before finishing. The next model in the chain is tried automatically.",
  },
  empty: { title: "The model returned nothing", hint: "An empty completion. Retrying usually clears it." },
};

export function ErrorCard({
  error,
  onRetry,
  compact = false,
}: {
  error: LLMErrorShape;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const copy = ERROR_COPY[error.kind] ?? ERROR_COPY.upstream;
  const [wait, setWait] = useState(error.kind === "rate_limit" ? error.retryAfter ?? 20 : 0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  return (
    <div className={`rise border-l-2 border-danger bg-danger-soft ${compact ? "p-3" : "p-4"}`}>
      <p className="micro text-danger">{copy.title}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{error.message}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">{copy.hint}</p>

      {error.raw && (
        <details className="mt-2.5">
          <summary className="micro cursor-pointer text-ink-3 hover:text-ink-2">Raw model output</summary>
          <pre className="scroll-thin mt-1.5 max-h-32 overflow-auto border border-rule bg-panel p-2 font-mono text-[10.5px] leading-relaxed text-ink-2">
            {error.raw}
          </pre>
        </details>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          disabled={wait > 0}
          className="micro mt-3 cursor-pointer bg-danger px-3 py-1.5 text-on-solid transition hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {wait > 0 ? `Retry in ${wait}s` : "Try again"}
        </button>
      )}
    </div>
  );
}

/* ───────────────────────────── Waiting ───────────────────────────── */

export function ProfileSkeleton({ i }: { i: number }) {
  return (
    <div className="border-b border-rule-2 py-4" style={{ opacity: 1 - i * 0.18 }}>
      <div className="flex items-start gap-4">
        <div className="shimmer h-3 w-4" />
        <div className="flex-1 space-y-2.5">
          <div className="shimmer h-5 w-44" />
          <div className="shimmer h-3 w-72" />
          <div className="shimmer h-3 w-full" />
          <div className="flex gap-1.5">
            <div className="shimmer h-4 w-24" />
            <div className="shimmer h-4 w-20" />
          </div>
        </div>
        <div className="shimmer h-7 w-10" />
      </div>
    </div>
  );
}

/** A long wait needs an explanation, not a longer spinner. On the free tier a
    wide shortlist genuinely queues behind the token limit, so the copy says so. */
export function ThinkingLine({ label }: { label: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const note =
    elapsed >= 22
      ? "Still going. Scores already returned are kept, so nothing is lost."
      : elapsed >= 11
        ? "Longer than usual — the free tier allows 8,000 tokens a minute, so a wide shortlist queues."
        : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="flex gap-[3px]">
          {[0, 1, 2].map((i) => (
            <span key={i} className="dot h-[5px] w-[5px] bg-accent" style={{ animationDelay: `${i * 0.16}s` }} />
          ))}
        </span>
        <span className="micro text-ink-2">{label}</span>
        {elapsed > 3 && <span className="font-mono text-[10.5px] tabular-nums text-ink-3">{elapsed}s</span>}
      </div>
      {note && <p className="pl-[26px] text-[11.5px] leading-relaxed text-ink-3">{note}</p>}
    </div>
  );
}
