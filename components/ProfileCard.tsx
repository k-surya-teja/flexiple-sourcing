"use client";

import { Chip, Icon, ScoreBadge } from "./Primitives";
import type { Rubric } from "@/lib/schemas";
import type { SearchResult } from "@/lib/client";

const VERDICT_TONE = { strong: "strong", possible: "possible", weak: "weak" } as const;

export function ProfileCard({
  rank,
  result,
  rubric,
  reaction,
  onReact,
  frozen,
}: {
  rank: number;
  result: SearchResult;
  rubric: Rubric;
  reaction?: "yes" | "no";
  onReact?: (r: "yes" | "no") => void;
  frozen?: boolean;
}) {
  const { profile, score } = result;
  const labelOf = (id: string) => rubric.criteria.find((c) => c.id === id)?.label ?? id;

  // Only criteria whose citations survived verification are shown as met.
  const grounded = score.assessments.filter((a) => a.grounded);
  const missing = score.assessments.filter((a) => a.met === "no");
  const citations = grounded.flatMap((a) => a.evidence.filter((e) => e.verified)).slice(0, 4);

  return (
    <article
      className={`rise rounded-xl border bg-panel p-4 transition ${
        reaction === "yes"
          ? "border-strong/45 ring-1 ring-strong/15"
          : reaction === "no"
            ? "border-line opacity-55"
            : "border-line hover:border-line/60 hover:shadow-[0_1px_2px_rgba(20,22,28,0.04),0_6px_16px_-10px_rgba(20,22,28,0.14)]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-4 shrink-0 font-mono text-[12px] tabular-nums text-ink-3">{rank}</span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[14.5px] font-semibold leading-tight text-ink">{profile.name}</h3>
                <Chip tone={VERDICT_TONE[score.verdict]}>{score.verdict}</Chip>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
                {profile.current_title} · {profile.years_experience} yrs ·{" "}
                <span className="text-ink">{profile.current_company}</span>{" "}
                <span className="text-ink-3">({profile.current_company_type})</span> · {profile.location}
              </p>
            </div>
            <ScoreBadge score={score.score} verdict={score.verdict} />
          </div>

          <p className="mt-2.5 text-[13px] leading-relaxed text-ink">{score.headline}</p>

          {(grounded.length > 0 || missing.length > 0) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {grounded.map((a) => (
                <Chip key={a.criterion_id} tone={a.met === "yes" ? "strong" : "possible"}>
                  {a.met === "yes" ? <Icon.Check className="h-2.5 w-2.5" /> : <span className="text-[11px]">~</span>}
                  {labelOf(a.criterion_id)}
                </Chip>
              ))}
              {missing.map((a) => (
                <Chip key={a.criterion_id} tone="weak">
                  <Icon.Cross className="h-2.5 w-2.5 opacity-60" />
                  {labelOf(a.criterion_id)}
                </Chip>
              ))}
            </div>
          )}

          {/* The trust line: every claim above traces to a real field on this
              profile. Claims that failed verification were dropped upstream. */}
          {citations.length > 0 && (
            <p className="mt-2 truncate font-mono text-[10.5px] leading-relaxed text-ink-3">
              {citations.map((e, i) => (
                <span key={`${e.field}-${e.value}-${i}`}>
                  {i > 0 && <span className="mx-1 opacity-40">·</span>}
                  {e.field}: <span className="text-ink-2">&ldquo;{e.value}&rdquo;</span>
                </span>
              ))}
            </p>
          )}

          {score.claims.dropped > 0 && (
            <p className="mt-1.5 text-[11px] text-ink-3">
              {score.claims.dropped} unverified {score.claims.dropped === 1 ? "claim" : "claims"} hidden — the
              model cited something this profile does not say.
            </p>
          )}

          {!frozen && onReact && (
            <div className="mt-3 flex items-center gap-1.5">
              {(["yes", "no"] as const).map((r) => {
                const active = reaction === r;
                return (
                  <button
                    key={r}
                    onClick={() => onReact(r)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[12px] font-medium transition ${
                      active && r === "yes"
                        ? "border-strong/40 bg-strong-soft text-strong"
                        : active && r === "no"
                          ? "border-line bg-line-2 text-ink-2"
                          : "border-line bg-panel text-ink-3 hover:border-ink-3/40 hover:text-ink-2"
                    }`}
                  >
                    {r === "yes" ? <Icon.Check className="h-3 w-3" /> : <Icon.Cross className="h-3 w-3" />}
                    {r === "yes" ? "Match" : "Not a match"}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
