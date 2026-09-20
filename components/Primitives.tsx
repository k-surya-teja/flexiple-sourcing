"use client";

import type { LLMErrorShape } from "@/lib/client";
import { useEffect, useState } from "react";

/* ─────────────────────────────── Icons ─────────────────────────────── */

export const Icon = {
  Lock: (p: { className?: string }) => (
    <svg viewBox="0 0 16 16" fill="none" className={p.className} aria-hidden>
      <rect x="3.5" y="7" width="9" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.75 7V5.25a2.25 2.25 0 0 1 4.5 0V7" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
  Check: (p: { className?: string }) => (
    <svg viewBox="0 0 16 16" fill="none" className={p.className} aria-hidden>
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Cross: (p: { className?: string }) => (
    <svg viewBox="0 0 16 16" fill="none" className={p.className} aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  Arrow: (p: { className?: string }) => (
    <svg viewBox="0 0 16 16" fill="none" className={p.className} aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Spark: (p: { className?: string }) => (
    <svg viewBox="0 0 16 16" fill="none" className={p.className} aria-hidden>
      <path d="M8 1.5l1.6 4.1 4.4 1.6-4.4 1.6L8 13l-1.6-4.2L2 7.2l4.4-1.6L8 1.5z" fill="currentColor" />
    </svg>
  ),
  Freeze: (p: { className?: string }) => (
    <svg viewBox="0 0 16 16" fill="none" className={p.className} aria-hidden>
      <path d="M8 1.5v13M2.5 4.5l11 7M13.5 4.5l-11 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
};

/* ─────────────────────────────── Bits ─────────────────────────────── */

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
    neutral: "bg-line-2 text-ink-2",
    accent: "bg-accent-soft text-accent-ink",
    strong: "bg-strong-soft text-strong",
    possible: "bg-possible-soft text-possible",
    weak: "bg-weak-soft text-weak",
    danger: "bg-danger-soft text-danger",
  }[tone];

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-[3px] text-[12px] font-medium leading-5 ${tones}`}
    >
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 -mr-0.5 rounded p-0.5 opacity-45 transition hover:opacity-100"
          aria-label="Remove"
        >
          <Icon.Cross className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  );
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{children}</h3>
      {right}
    </div>
  );
}

/** 1–5 weight, shown as dots. Reads at a glance, unlike a number. */
export function WeightDots({ weight, onChange }: { weight: number; onChange?: (w: number) => void }) {
  return (
    <span className="inline-flex items-center gap-[3px]" title={`Weight ${weight} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          disabled={!onChange}
          onClick={() => onChange?.(i)}
          aria-label={`Set weight ${i}`}
          className={`h-[7px] w-[7px] rounded-full transition ${
            i <= weight ? "bg-accent" : "bg-line"
          } ${onChange ? "cursor-pointer hover:scale-125" : ""}`}
        />
      ))}
    </span>
  );
}

export function ScoreBadge({ score, verdict }: { score: number; verdict: "strong" | "possible" | "weak" }) {
  const tone = { strong: "text-strong", possible: "text-possible", weak: "text-weak" }[verdict];
  const track = { strong: "bg-strong", possible: "bg-possible", weak: "bg-weak" }[verdict];
  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <div className={`font-mono text-[19px] font-semibold leading-none tabular-nums ${tone}`}>{score}</div>
      <div className="h-[3px] w-12 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${track}`} style={{ width: `${Math.max(4, score)}%` }} />
      </div>
    </div>
  );
}

/* ───────────────────────── Failure, designed ─────────────────────────
   Every LLM failure mode gets its own sentence and its own next step.
   A generic "something went wrong" toast is the thing we are avoiding. */

const ERROR_COPY: Record<LLMErrorShape["kind"], { title: string; hint: string }> = {
  missing_key: {
    title: "No API key configured",
    hint: "Add GROQ_API_KEY to .env.local and restart the dev server. Nothing here works without it.",
  },
  rate_limit: {
    title: "Groq rate limit reached",
    hint: "The free tier allows a burst, then asks for a short wait. Your criteria and results are untouched.",
  },
  timeout: {
    title: "The model took too long",
    hint: "Usually a slow batch rather than a real outage. Retrying often works immediately.",
  },
  upstream: { title: "Groq is unreachable", hint: "The provider returned an error. Your search state is safe." },
  malformed: {
    title: "The model returned an unusable response",
    hint: "It failed schema validation twice, including one corrected retry. Nothing was applied.",
  },
  truncated: {
    title: "The model ran out of room",
    hint: "It spent its token budget before finishing the JSON. The next model in the chain is tried automatically.",
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
    <div className={`rise rounded-xl border border-danger/25 bg-danger-soft ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start gap-2.5">
        <span className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
          !
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-danger">{copy.title}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">{error.message}</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-3">{copy.hint}</p>

          {error.raw && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11.5px] font-medium text-ink-3 hover:text-ink-2">
                What the model actually returned
              </summary>
              <pre className="mt-1.5 max-h-32 overflow-auto rounded-md bg-panel/70 p-2 font-mono text-[10.5px] leading-relaxed text-ink-2 scroll-thin">
                {error.raw}
              </pre>
            </details>
          )}

          {onRetry && (
            <button
              onClick={onRetry}
              disabled={wait > 0}
              className="mt-2.5 rounded-lg bg-danger px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {wait > 0 ? `Retry in ${wait}s` : "Try again"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Skeletons ───────────────────────────── */

export function ProfileSkeleton({ i }: { i: number }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4" style={{ opacity: 1 - i * 0.16 }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="shimmer h-4 w-40 rounded" />
          <div className="shimmer h-3 w-64 rounded" />
        </div>
        <div className="shimmer h-5 w-9 rounded" />
      </div>
      <div className="shimmer mt-3.5 h-3 w-full rounded" />
      <div className="mt-3 flex gap-1.5">
        <div className="shimmer h-5 w-24 rounded-md" />
        <div className="shimmer h-5 w-20 rounded-md" />
      </div>
    </div>
  );
}

/* A long wait needs an explanation, not a longer spinner. On the free tier a
   wide shortlist genuinely queues behind the token-per-minute limit, so after a
   few seconds the copy says so rather than leaving the recruiter guessing. */
export function ThinkingLine({ label }: { label: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const note =
    elapsed >= 22
      ? "Still going — scores already returned are kept, so nothing is lost."
      : elapsed >= 11
        ? "Taking longer than usual. Groq's free tier allows 8k tokens a minute, so a wide shortlist queues."
        : null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink-3">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="dot h-1.5 w-1.5 rounded-full bg-accent"
              style={{ animationDelay: `${i * 0.16}s` }}
            />
          ))}
        </span>
        {label}
        {elapsed > 3 && <span className="font-mono text-[11px] tabular-nums text-ink-3/70">{elapsed}s</span>}
      </div>
      {note && <p className="pl-6 text-[11.5px] leading-relaxed text-ink-3">{note}</p>}
    </div>
  );
}
