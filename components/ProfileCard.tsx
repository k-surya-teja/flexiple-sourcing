"use client";

import { Chip, CopyField, Icon, ScoreBadge } from "./Primitives";
import type { Rubric } from "@/lib/schemas";
import type { SearchResult } from "@/lib/client";

const VERDICT_TONE = { strong: "strong", possible: "possible", weak: "weak" } as const;

/* A dossier entry, not a card in a deck: hairline separated rows, the rank set
   as a numeral in the margin, and the candidate's name in the display serif —
   the one move that makes this read as something you review rather than
   something you administer. */

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
  const critOf = (id: string) => rubric.criteria.find((c) => c.id === id);
  const labelOf = (id: string) => critOf(id)?.label ?? id;
  const isNegative = (id: string) => critOf(id)?.polarity === "negative";

  // Only criteria whose citations survived verification are shown as met.
  const grounded = score.assessments.filter((a) => a.grounded);

  /* A negative criterion that was NOT met is the good outcome — the candidate
     does not have the trait being avoided. Rendering that as a grey ✗ reads as
     a failure, so absence of the flag is left unsaid; only a negative criterion
     that IS met earns a chip, and it earns a warning one. */
  const missing = score.assessments.filter((a) => a.met === "no" && !isNegative(a.criterion_id));

  /* The model often cites the same phrase for several criteria. Dedupe, trim
     long summary quotes, and cap — the citation line is evidence, not prose. */
  const citations = (() => {
    const seen = new Set<string>();
    const out: { field: string; value: string }[] = [];
    for (const e of grounded.flatMap((a) => a.evidence.filter((x) => x.verified))) {
      const value = e.value.length > 52 ? `${e.value.slice(0, 52).trimEnd()}…` : e.value;
      const key = `${e.field}:${value.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ field: e.field, value });
      if (out.length === 3) break;
    }
    return out;
  })();

  return (
    <article
      className={`rise group relative border-b border-rule-2 py-5 pl-11 pr-1 transition-colors ${
        reaction === "yes"
          ? "bg-strong-soft/40"
          : reaction === "no"
            ? "opacity-45"
            : "hover:bg-panel-2/60"
      }`}
    >
      {reaction === "yes" && <span className="absolute inset-y-0 left-0 w-[2px] bg-strong" />}

      {/* Clear of the match bar at left-0, which otherwise sits over the
          leading zero and reads as a different number entirely. */}
      <span className="absolute left-2.5 top-[23px] font-mono text-[11px] tabular-nums text-ink-3">
        {String(rank).padStart(2, "0")}
      </span>

      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h3 className="display text-[21px] leading-tight text-ink">{profile.name}</h3>
            <Chip tone={VERDICT_TONE[score.verdict]}>{score.verdict}</Chip>
          </div>

          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">
            {profile.current_title}
            <span className="mx-1.5 text-rule">|</span>
            <span className="font-mono text-[11.5px] tabular-nums">{profile.years_experience}y</span>
            <span className="mx-1.5 text-rule">|</span>
            <span className="text-ink">{profile.current_company}</span>{" "}
            <span className="text-ink-3">({profile.current_company_type})</span>
            <span className="mx-1.5 text-rule">|</span>
            {profile.location}
          </p>
        </div>

        <ScoreBadge score={score.score} verdict={score.verdict} />
      </div>

      <p className="mt-3 max-w-[64ch] text-[14px] leading-[1.55] text-ink">{score.headline}</p>

      {(grounded.length > 0 || missing.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {grounded.map((a) => {
            const neg = isNegative(a.criterion_id);
            return (
              <Chip
                key={a.criterion_id}
                tone={neg ? "danger" : a.met === "yes" ? "strong" : "possible"}
                title={neg ? "A trait this search is trying to avoid" : undefined}
              >
                {neg ? <span>!</span> : a.met === "yes" ? <Icon.Check className="h-2.5 w-2.5" /> : <span>~</span>}
                {labelOf(a.criterion_id)}
              </Chip>
            );
          })}
          {missing.map((a) => (
            <Chip key={a.criterion_id} tone="weak">
              <Icon.Cross className="h-2.5 w-2.5 opacity-50" />
              {labelOf(a.criterion_id)}
            </Chip>
          ))}
        </div>
      )}

      {/* The trust line: every claim above traces to a real field on this
          profile. Claims that failed verification were dropped upstream. */}
      {citations.length > 0 && (
        <div className="mt-2.5 flex items-start gap-2">
          <span className="micro mt-[3px] shrink-0 text-ink-3/70">cited</span>
          <p className="min-w-0 font-mono text-[10.5px] leading-[1.7] text-ink-3">
            {citations.map((e, i) => (
              <span key={`${e.field}-${e.value}-${i}`}>
                {i > 0 && <span className="mx-1.5 text-rule">·</span>}
                {e.field}
                <span className="text-ink-2">={e.value}</span>
              </span>
            ))}
          </p>
        </div>
      )}

      {score.claims.dropped > 0 && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
          {score.claims.dropped} unverified {score.claims.dropped === 1 ? "claim" : "claims"} hidden — the model
          cited something this profile does not say.
        </p>
      )}

      {(profile.email || profile.linkedin) && (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
          {profile.email && <CopyField label="mail" value={profile.email} />}
          {profile.linkedin && (
            <CopyField
              label="linkedin"
              value={profile.linkedin}
              display={profile.linkedin.replace(/^linkedin\.com/, "")}
            />
          )}
        </div>
      )}

      {!frozen && onReact && (
        <div className="mt-3.5 flex items-center gap-2 opacity-70 transition group-hover:opacity-100">
          {(["yes", "no"] as const).map((r) => {
            const active = reaction === r;
            return (
              <button
                key={r}
                onClick={() => onReact(r)}
                className={`micro inline-flex cursor-pointer items-center gap-1.5 border px-2 py-1 transition ${
                  active && r === "yes"
                    ? "border-strong bg-strong text-on-solid"
                    : active && r === "no"
                      ? "border-ink-3 bg-ink-3 text-on-solid"
                      : "border-rule bg-panel text-ink-3 hover:border-ink-3 hover:text-ink"
                }`}
              >
                {r === "yes" ? <Icon.Check className="h-2.5 w-2.5" /> : <Icon.Cross className="h-2.5 w-2.5" />}
                {r === "yes" ? "Match" : "No"}
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}
