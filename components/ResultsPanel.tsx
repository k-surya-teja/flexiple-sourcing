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
      <div>
        <div className="border-b border-rule pb-3">
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
      <div className="rise border border-rule bg-panel px-8 py-14 text-center">
        <p className="display text-[26px] leading-tight text-ink">Nobody clears these filters</p>
        <p className="mx-auto mt-2.5 max-w-[46ch] text-[13.5px] leading-[1.6] text-ink-2">
          All {data.pool.totalPool} profiles were eliminated, so there was nothing to score and no reason to call
          the model.
        </p>
        {worst && (
          <p className="mx-auto mt-5 max-w-[48ch] border-l-2 border-accent bg-paper py-3 pl-4 pr-4 text-left text-[12.5px] leading-[1.6] text-ink-2">
            <span className="micro block text-accent">Most expensive clause</span>
            <span className="mt-1.5 block">
              <span className="font-semibold text-ink">{FILTER_LABELS[worst[0]]}</span> removes {worst[1]} of{" "}
              {data.pool.totalPool} on its own. Loosening it on the left, or saying so in the chat, is the fastest
              way back.
            </span>
          </p>
        )}
      </div>
    );
  }

  const shown = showAll ? data.results : data.results.slice(0, PAGE);

  return (
    <div>
      {data.degraded && (
        <div className="mb-3 border-l-2 border-possible bg-possible-soft px-3.5 py-2.5">
          <span className="micro text-possible">Partial results</span>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
            {data.degraded.message} {data.unscored.length}{" "}
            {data.unscored.length === 1 ? "profile is" : "profiles are"} missing from this ranking; everything
            below was scored normally.
          </p>
        </div>
      )}

      <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-2">
        <span className="micro text-ink">
          Ranked · {data.results.length} scored
        </span>
        {data.truncated > 0 && (
          <span className="font-mono text-[10.5px] text-ink-3">
            {data.pool.matched} clear filters · top {data.results.length} scored
          </span>
        )}
      </div>

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
          className="micro mt-3 w-full cursor-pointer border border-dashed border-rule py-3 text-ink-3 transition hover:border-accent hover:text-accent"
        >
          {showAll ? "Show top 5 only" : `Show all ${data.results.length} scored profiles`}
        </button>
      )}
    </div>
  );
}
