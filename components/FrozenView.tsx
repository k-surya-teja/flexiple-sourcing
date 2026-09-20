"use client";

import { useState } from "react";
import { CriteriaPanel } from "./CriteriaPanel";
import { ProfileCard } from "./ProfileCard";
import { Icon } from "./Primitives";
import type { Filters, Rubric } from "@/lib/schemas";
import type { PoolInfo, SearchResult } from "@/lib/client";

export function FrozenView({
  query,
  filters,
  rubric,
  results,
  pool,
  rounds,
  onReopen,
  onRestart,
}: {
  query: string;
  filters: Filters;
  rubric: Rubric;
  results: SearchResult[];
  pool: PoolInfo | null;
  rounds: number;
  onReopen: () => void;
  onRestart: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = [
      `Shortlist — ${query}`,
      `Frozen after ${rounds} refinement ${rounds === 1 ? "round" : "rounds"}.`,
      "",
      ...results.map(
        (r, i) =>
          `${i + 1}. ${r.profile.name} (${r.score.score}/100, ${r.score.verdict}) — ${r.profile.current_title}, ${r.profile.current_company}, ${r.profile.location}\n   ${r.score.headline}`,
      ),
    ].join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="min-h-screen">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto max-w-6xl px-6 py-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[11.5px] font-semibold text-accent-ink">
                <Icon.Freeze className="h-3 w-3" />
                Search frozen
              </div>
              <h1 className="max-w-2xl text-[20px] font-semibold leading-snug tracking-[-0.01em] text-ink">
                &ldquo;{query}&rdquo;
              </h1>
              <p className="mt-1.5 text-[13px] text-ink-2">
                {results.length} ranked {results.length === 1 ? "candidate" : "candidates"}
                {pool && ` from ${pool.matched} who cleared the filters, out of ${pool.totalPool} indexed`} ·{" "}
                {rounds} refinement {rounds === 1 ? "round" : "rounds"}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={copy}
                className="rounded-lg border border-line bg-panel px-3 py-2 text-[12.5px] font-medium text-ink-2 transition hover:border-ink-3/40 hover:text-ink"
              >
                {copied ? "Copied" : "Copy shortlist"}
              </button>
              <button
                onClick={onReopen}
                className="rounded-lg border border-line bg-panel px-3 py-2 text-[12.5px] font-medium text-ink-2 transition hover:border-ink-3/40 hover:text-ink"
              >
                Keep refining
              </button>
              <button
                onClick={onRestart}
                className="rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-white transition hover:bg-accent-ink"
              >
                New search
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[360px_1fr]">
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
          <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
            Final ranked shortlist
          </h2>
          <div className="space-y-2.5">
            {results.map((r, i) => (
              <ProfileCard key={r.profile.id} rank={i + 1} result={r} rubric={rubric} frozen />
            ))}
            {results.length === 0 && (
              <p className="rounded-xl border border-line bg-panel px-5 py-8 text-center text-[13px] text-ink-2">
                This search was frozen with no matching profiles.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
