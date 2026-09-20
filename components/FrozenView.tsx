"use client";

import { useState } from "react";
import { CriteriaPanel } from "./CriteriaPanel";
import { ProfileCard } from "./ProfileCard";
import { Icon, RuleLabel } from "./Primitives";
import { ThemeToggle } from "./ThemeToggle";
import type { Filters, Rubric } from "@/lib/schemas";
import type { PoolInfo, SearchResult } from "@/lib/client";

export function FrozenView({
  query,
  filters,
  rubric,
  results,
  pool,
  rounds,
  onBack,
  onReopen,
  onRestart,
}: {
  query: string;
  filters: Filters;
  rubric: Rubric;
  results: SearchResult[];
  pool: PoolInfo | null;
  rounds: number;
  onBack: () => void;
  onReopen: () => void;
  onRestart: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = [
      `Shortlist — ${query}`,
      `Frozen after ${rounds} refinement ${rounds === 1 ? "round" : "rounds"}.`,
      "",
      ...results.map((r, i) => {
        const contact = [r.profile.email, r.profile.linkedin].filter(Boolean).join("  ·  ");
        return [
          `${i + 1}. ${r.profile.name} (${r.score.score}/100, ${r.score.verdict}) — ${r.profile.current_title}, ${r.profile.current_company}, ${r.profile.location}`,
          `   ${r.score.headline}`,
          contact ? `   ${contact}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      }),
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-8 py-10">
      {/* Masthead */}
      <header className="flex items-baseline gap-3 border-b border-ink pb-3">
        <button
          onClick={onBack}
          title="Back to all searches — this one is kept"
          aria-label="Back to all searches"
          className="group/back -ml-1.5 self-center cursor-pointer border border-transparent p-2 text-ink-3 transition hover:border-rule hover:bg-panel hover:text-ink"
        >
          <Icon.ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover/back:-translate-x-0.5" />
        </button>
        <span className="display text-[30px] leading-none text-ink">Flexiple</span>
        <span className="micro text-ink-3">Sourcing</span>
        <span className="flex-1" />
        <span className="micro text-accent">Frozen</span>
        <ThemeToggle />
      </header>

      <div className="rise flex flex-wrap items-end justify-between gap-6 border-b-2 border-ink py-8">
        <div className="min-w-0 max-w-3xl">
          <p className="micro mb-3 text-ink-3">Final shortlist</p>
          <h1 className="display text-[36px] leading-[1.06] text-ink">&ldquo;{query}&rdquo;</h1>
          <p className="mt-3.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-ink-2">
            <span>{results.length} ranked</span>
            {pool && (
              <>
                <span className="text-rule">/</span>
                <span>{pool.matched} cleared filters</span>
                <span className="text-rule">/</span>
                <span>{pool.totalPool} indexed</span>
              </>
            )}
            <span className="text-rule">/</span>
            <span>
              {rounds} refinement {rounds === 1 ? "round" : "rounds"}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            onClick={copy}
            className="micro cursor-pointer border border-rule bg-panel px-3 py-2 text-ink-2 transition hover:border-ink hover:text-ink"
          >
            {copied ? "Copied" : "Copy shortlist"}
          </button>
          <button
            onClick={onReopen}
            className="micro inline-flex cursor-pointer items-center gap-1.5 border border-rule bg-panel px-3 py-2 text-ink-2 transition hover:border-ink hover:text-ink"
          >
            <Icon.Freeze className="h-3 w-3" />
            Keep refining
          </button>
          <button
            onClick={onRestart}
            className="micro cursor-pointer bg-accent px-3 py-2 text-on-solid transition hover:bg-accent-ink"
          >
            New search
          </button>
        </div>
      </div>

      <div className="grid gap-10 py-8 lg:grid-cols-[320px_1fr]">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <CriteriaPanel
            filters={filters}
            rubric={rubric}
            pool={pool}
            locked={new Set()}
            frozen
            onFilters={() => {}}
            onRubric={() => {}}
          />
        </aside>

        <section>
          <RuleLabel>Ranked candidates</RuleLabel>
          <div className="border-t border-ink">
            {results.map((r, i) => (
              <ProfileCard key={r.profile.id} rank={i + 1} result={r} rubric={rubric} frozen />
            ))}
          </div>
          {results.length === 0 && (
            <p className="border border-rule bg-panel px-6 py-10 text-center text-[13px] text-ink-2">
              This search was frozen with no matching profiles.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
