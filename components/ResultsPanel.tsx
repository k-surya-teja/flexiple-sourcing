"use client";

import { useState } from "react";
import { ProfileCard } from "./ProfileCard";
import { ErrorCard, ProfileSkeleton, ThinkingLine } from "./Primitives";
import { FILTER_LABELS, type FilterKey } from "@/lib/filter";
import type { LLMErrorShape, SearchResponse } from "@/lib/client";
import type { Rubric } from "@/lib/schemas";

const PAGE = 5;

export function ResultsPanel({
  data,
  rubric,
  busy,
  error,
  reactions,
  onReact,
  onRetry,
  frozen,
}: {
  data: SearchResponse | null;
  rubric: Rubric;
  busy: boolean;
  error: LLMErrorShape | null;
  reactions: Record<string, "yes" | "no">;
  onReact: (id: string, r: "yes" | "no") => void;
  onRetry: () => void;
  frozen?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);

  if (busy) {
    return (
      <div className="space-y-2.5">
        <div className="pb-1">
          <ThinkingLine label="Scoring the shortlist against your rubric" />
        </div>
        {[0, 1, 2, 3].map((i) => (
          <ProfileSkeleton key={i} i={i} />
        ))}
      </div>
    );
  }

  if (error) return <ErrorCard error={error} onRetry={onRetry} />;
  if (!data) return null;

  /* Empty state that earns its keep: name the clause doing the damage rather
     than shrugging. eliminatedBy comes free from the pure filter pass. */
  if (data.results.length === 0) {
    const worst = (Object.entries(data.pool.eliminatedBy) as [FilterKey, number][])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])[0];

    return (
      <div className="rise rounded-xl border border-line bg-panel px-6 py-10 text-center">
        <p className="text-[14.5px] font-semibold text-ink">Nobody clears these filters</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-2">
          All {data.pool.totalPool} profiles were eliminated, so there was nothing to score and no reason to
          call the model.
        </p>
        {worst && (
          <p className="mx-auto mt-3 max-w-sm rounded-lg bg-canvas px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
            <span className="font-semibold text-ink">{FILTER_LABELS[worst[0]]}</span> is the most expensive
            clause on its own — it removes {worst[1]} of {data.pool.totalPool}. Loosening it on the left, or
            saying so in the chat, is the fastest way back.
          </p>
        )}
      </div>
    );
  }

  const shown = showAll ? data.results : data.results.slice(0, PAGE);

  return (
    <div className="space-y-2.5">
      {data.degraded && (
        <div className="rounded-xl border border-possible/30 bg-possible-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-possible">
          <span className="font-semibold">Partial results.</span> {data.degraded.message} {data.unscored.length}{" "}
          {data.unscored.length === 1 ? "profile is" : "profiles are"} missing from this ranking; everything
          shown below was scored normally.
        </div>
      )}

      {data.truncated > 0 && (
        <p className="px-0.5 text-[12px] leading-relaxed text-ink-3">
          {data.pool.matched} profiles clear your filters. The top {data.results.length} were scored —
          tighten the filters on the left to bring the rest into range.
        </p>
      )}

      {shown.map((r, i) => (
        <ProfileCard
          key={r.profile.id}
          rank={i + 1}
          result={r}
          rubric={rubric}
          frozen={frozen}
          reaction={reactions[r.profile.id]}
          onReact={(v) => onReact(r.profile.id, v)}
        />
      ))}

      {data.results.length > PAGE && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="w-full rounded-xl border border-dashed border-line bg-panel/60 py-2.5 text-[12.5px] font-medium text-ink-3 transition hover:border-accent/35 hover:text-accent-ink"
        >
          {showAll ? "Show top 5 only" : `Show all ${data.results.length} scored profiles`}
        </button>
      )}
    </div>
  );
}
