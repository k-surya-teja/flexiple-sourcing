"use client";

import { useState } from "react";
import { Icon, ErrorCard, ThinkingLine } from "./Primitives";
import { ThemeToggle } from "./ThemeToggle";
import type { LLMErrorShape } from "@/lib/client";

const EXAMPLES = [
  "RDS developers with 4-7 years of experience who have worked at startups, for a role based in Bangalore",
  "Senior frontend engineers in Bangalore who have owned a design system end to end",
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
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-10 py-9">
      {/* Masthead */}
      <header className="flex items-baseline gap-3 border-b border-ink pb-2.5">
        <span className="display text-[17px] leading-none text-ink">Flexiple</span>
        <span className="micro text-ink-3">Sourcing</span>
        <span className="flex-1" />
        <span className="micro text-ink-3">48 profiles indexed</span>
        <ThemeToggle />
      </header>

      <div className="rise flex-1 pb-16 pt-16">
        <p className="micro mb-5 text-accent">Step one of three</p>

        <h1 className="display max-w-[15ch] text-[60px] leading-[0.95] text-ink">
          Describe who you&rsquo;re looking for.
        </h1>

        <p className="mt-5 max-w-[54ch] text-[15px] leading-[1.6] text-ink-2">
          Write it the way you&rsquo;d say it out loud. You&rsquo;ll get objective filters and a fit rubric you
          can edit, then you can argue with the results until they&rsquo;re right.
        </p>

        <form
          className="mt-10 max-w-3xl"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim().length >= 3 && !busy) onSubmit(q.trim());
          }}
        >
          <div className="border border-ink bg-panel transition-shadow focus-within:shadow-[4px_4px_0_0_var(--color-accent)]">
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
              className="w-full resize-none bg-transparent px-4 py-3.5 text-[15px] leading-[1.6] text-ink placeholder:text-ink-3/60 focus:outline-none disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-3 border-t border-rule px-3 py-2">
              <span className="micro text-ink-3">{busy ? "Working" : "⌘ + return"}</span>
              <button
                type="submit"
                disabled={q.trim().length < 3 || busy}
                className="micro inline-flex cursor-pointer items-center gap-2 bg-accent px-4 py-2 text-on-solid transition hover:bg-accent-ink disabled:cursor-not-allowed disabled:bg-rule disabled:text-ink-3"
              >
                {busy ? "Reading the brief" : "Build the search"}
                {!busy && <Icon.Arrow className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </form>

        {busy && (
          <div className="mt-6 max-w-3xl border-l-2 border-accent bg-panel py-3 pl-4 pr-4">
            <ThinkingLine label="Turning your sentence into filters and a rubric" />
            <p className="mt-2 max-w-[62ch] pl-[26px] text-[12px] leading-relaxed text-ink-3">
              Hard constraints become filters applied in code. Everything subjective becomes a weighted rubric
              the model scores against.
            </p>
          </div>
        )}

        {error && !busy && (
          <div className="mt-6 max-w-3xl">
            <ErrorCard error={error} onRetry={onRetry} />
          </div>
        )}

        {!busy && !error && (
          <div className="mt-12 max-w-3xl">
            <div className="mb-1 flex items-center gap-2.5">
              <span className="micro shrink-0 text-ink-3">Or start from</span>
              <span className="h-px flex-1 bg-rule" />
            </div>
            <ul>
              {EXAMPLES.map((e, i) => (
                <li key={e}>
                  <button
                    onClick={() => setQ(e)}
                    className="group flex w-full cursor-pointer items-baseline gap-3.5 border-b border-rule-2 py-3 text-left transition hover:bg-panel-2"
                  >
                    <span className="micro shrink-0 text-ink-3 transition group-hover:text-accent">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[13.5px] leading-[1.55] text-ink-2 transition group-hover:text-ink">
                      {e}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
