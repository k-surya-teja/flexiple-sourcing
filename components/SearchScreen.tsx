"use client";

import { useState } from "react";
import { Icon, ErrorCard, ThinkingLine } from "./Primitives";
import type { LLMErrorShape } from "@/lib/client";

const EXAMPLES = [
  "RDS developers with 4-7 years of experience who have worked at startups, for a role based in Bangalore",
  "Senior frontend engineers in Bangalore who have owned a design system",
  "Data engineers with 5+ years who have worked somewhere with real scale",
];

export function SearchScreen({
  onSubmit,
  busy,
  error,
  onRetry,
}: {
  onSubmit: (q: string) => void;
  busy: boolean;
  error: LLMErrorShape | null;
  onRetry: () => void;
}) {
  const [q, setQ] = useState("");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-6 py-16">
      <div className="rise">
        <div className="mb-8">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[11.5px] font-medium text-ink-3">
            <Icon.Spark className="h-3 w-3 text-accent" />
            Sourcing · 48 profiles indexed
          </div>
          <h1 className="text-[30px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            Describe who you&rsquo;re looking for.
          </h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">
            Write it the way you&rsquo;d say it out loud. You&rsquo;ll get filters and a fit rubric you can
            edit, then you can argue with the results until they&rsquo;re right.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim().length >= 3 && !busy) onSubmit(q.trim());
          }}
        >
          <div className="rounded-2xl border border-line bg-panel p-1.5 shadow-[0_1px_2px_rgba(20,22,28,0.04),0_8px_24px_-12px_rgba(20,22,28,0.12)] transition focus-within:border-accent/40 focus-within:shadow-[0_0_0_4px_var(--color-accent-soft)]">
            <textarea
              value={q}
              autoFocus
              rows={3}
              disabled={busy}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit();
              }}
              placeholder="RDS developers with 4-7 years of experience who have worked at startups, for a role based in Bangalore"
              className="w-full resize-none bg-transparent px-3.5 py-3 text-[15px] leading-relaxed text-ink placeholder:text-ink-3/70 focus:outline-none disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-3 px-2 pb-1">
              <span className="text-[11.5px] text-ink-3">
                {busy ? "" : <kbd className="font-sans">⌘↵</kbd>}
                {busy ? "" : " to search"}
              </span>
              <button
                type="submit"
                disabled={q.trim().length < 3 || busy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[13.5px] font-semibold text-white transition hover:bg-accent-ink disabled:cursor-not-allowed disabled:opacity-35"
              >
                {busy ? "Reading the brief…" : "Build the search"}
                {!busy && <Icon.Arrow className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </form>

        {busy && (
          <div className="mt-5 rounded-xl border border-line bg-panel px-4 py-3.5">
            <ThinkingLine label="Turning your sentence into filters and a fit rubric" />
            <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
              Hard constraints become filters applied in code. Everything subjective becomes a weighted
              rubric the model scores against.
            </p>
          </div>
        )}

        {error && !busy && (
          <div className="mt-5">
            <ErrorCard error={error} onRetry={onRetry} />
          </div>
        )}

        {!busy && !error && (
          <div className="mt-7">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
              Or start from one of these
            </p>
            <div className="space-y-1.5">
              {EXAMPLES.map((e) => (
                <button
                  key={e}
                  onClick={() => setQ(e)}
                  className="block w-full rounded-lg border border-line bg-panel px-3.5 py-2.5 text-left text-[13px] leading-relaxed text-ink-2 transition hover:border-accent/35 hover:bg-accent-soft/40 hover:text-ink"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
