"use client";

import { useState } from "react";
import { Chip, Icon, SectionLabel, WeightDots } from "./Primitives";
import type { CompanyType, Filters, Rubric } from "@/lib/schemas";
import type { LockKey } from "@/lib/ops";
import type { PoolInfo } from "@/lib/client";
import { FILTER_LABELS, type FilterKey } from "@/lib/filter";

const COMPANY_TYPES: CompanyType[] = ["startup", "scaleup", "enterprise", "agency"];

/* Inline add/remove list. Editing anything here locks the field, so the next
   refinement round will not quietly undo what the recruiter just decided. */
function TokenField({
  values,
  onChange,
  placeholder,
  disabled,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const v = draft.trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((v) => (
        <Chip key={v} tone="accent" onRemove={disabled ? undefined : () => onChange(values.filter((x) => x !== v))}>
          {v}
        </Chip>
      ))}
      {!disabled && (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
          }}
          placeholder={values.length ? "+" : placeholder}
          className="min-w-[70px] flex-1 bg-transparent py-0.5 text-[12.5px] text-ink placeholder:text-ink-3/60 focus:outline-none"
        />
      )}
      {disabled && !values.length && <span className="text-[12.5px] text-ink-3">—</span>}
    </div>
  );
}

function Row({
  label,
  lockKey,
  locked,
  eliminated,
  children,
}: {
  label: string;
  lockKey?: LockKey;
  locked?: Set<LockKey>;
  eliminated?: number;
  children: React.ReactNode;
}) {
  const isLocked = lockKey ? locked?.has(lockKey) : false;
  return (
    <div className="grid grid-cols-[104px_1fr] items-start gap-3 py-2.5">
      <div className="flex items-center gap-1 pt-0.5">
        <span className="text-[12px] font-medium text-ink-3">{label}</span>
        {isLocked && (
          <span title="You edited this. Refinement will not overwrite it." className="text-accent">
            <Icon.Lock className="h-3 w-3" />
          </span>
        )}
        {!!eliminated && (
          <span title={`This clause alone removes ${eliminated} profiles`} className="font-mono text-[10px] text-ink-3/70">
            −{eliminated}
          </span>
        )}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function CriteriaPanel({
  filters,
  rubric,
  pool,
  locked,
  frozen,
  onFilters,
  onRubric,
}: {
  filters: Filters;
  rubric: Rubric;
  pool: PoolInfo | null;
  locked: Set<LockKey>;
  frozen?: boolean;
  onFilters: (f: Filters, lock: LockKey) => void;
  onRubric: (r: Rubric) => void;
}) {
  const set = (patch: Partial<Filters>, lock: LockKey) => onFilters({ ...filters, ...patch }, lock);
  const elim = (k: FilterKey) => pool?.eliminatedBy?.[k] ?? 0;

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel
          right={
            pool && (
              <span className="font-mono text-[11px] tabular-nums text-ink-3">
                {pool.matched}/{pool.totalPool} match
              </span>
            )
          }
        >
          Objective filters
        </SectionLabel>

        <div className="rounded-xl border border-line bg-panel px-3.5 py-1 divide-y divide-line-2">
          <Row label="Experience" lockKey="years_experience" locked={locked} eliminated={elim("years_experience")}>
            <div className="flex items-center gap-1.5 text-[12.5px]">
              {(["min", "max"] as const).map((k, i) => (
                <div key={k} className="flex items-center gap-1.5">
                  {i === 1 && <span className="text-ink-3">to</span>}
                  <input
                    type="number"
                    min={0}
                    max={40}
                    disabled={frozen}
                    value={filters.years_experience[k] ?? ""}
                    placeholder="any"
                    onChange={(e) =>
                      set(
                        {
                          years_experience: {
                            ...filters.years_experience,
                            [k]: e.target.value === "" ? null : Number(e.target.value),
                          },
                        },
                        "years_experience",
                      )
                    }
                    className="w-14 rounded-md border border-line bg-canvas px-2 py-1 font-mono tabular-nums text-ink focus:border-accent/45 focus:outline-none disabled:opacity-70"
                  />
                </div>
              ))}
              <span className="text-ink-3">years</span>
            </div>
          </Row>

          <Row label="Location" lockKey="locations" locked={locked} eliminated={elim("locations")}>
            <TokenField
              values={filters.locations}
              disabled={frozen}
              placeholder="Anywhere"
              onChange={(v) => set({ locations: v }, "locations")}
            />
          </Row>

          <Row label="Must have" lockKey="skills" locked={locked} eliminated={elim("skills_all_of")}>
            <TokenField
              values={filters.skills_all_of}
              disabled={frozen}
              placeholder="No required skills"
              onChange={(v) => set({ skills_all_of: v }, "skills")}
            />
          </Row>

          <Row label="Any one of" lockKey="skills" locked={locked} eliminated={elim("skills_any_of")}>
            <TokenField
              values={filters.skills_any_of}
              disabled={frozen}
              placeholder="No alternates"
              onChange={(v) => set({ skills_any_of: v }, "skills")}
            />
          </Row>

          <Row label="Background" lockKey="company_background" locked={locked} eliminated={elim("company_background")}>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {COMPANY_TYPES.map((t) => {
                  const on = filters.company_background.types.includes(t);
                  return (
                    <button
                      key={t}
                      disabled={frozen}
                      onClick={() =>
                        set(
                          {
                            company_background: {
                              ...filters.company_background,
                              types: on
                                ? filters.company_background.types.filter((x) => x !== t)
                                : [...filters.company_background.types, t],
                            },
                          },
                          "company_background",
                        )
                      }
                      className={`rounded-md px-2 py-[3px] text-[12px] font-medium capitalize transition ${
                        on ? "bg-accent-soft text-accent-ink" : "bg-line-2 text-ink-3 hover:text-ink-2"
                      } disabled:cursor-default`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
              {filters.company_background.types.length > 0 && (
                <div className="flex gap-1 rounded-md bg-line-2 p-0.5 text-[11.5px]">
                  {(["any", "current"] as const).map((s) => (
                    <button
                      key={s}
                      disabled={frozen}
                      onClick={() =>
                        set(
                          { company_background: { ...filters.company_background, scope: s } },
                          "company_background",
                        )
                      }
                      className={`flex-1 rounded px-2 py-1 font-medium transition ${
                        filters.company_background.scope === s
                          ? "bg-panel text-ink shadow-sm"
                          : "text-ink-3 hover:text-ink-2"
                      }`}
                    >
                      {s === "any" ? "Current or past" : "Current only"}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Row>

          <Row label="Title" lockKey="title_keywords" locked={locked} eliminated={elim("title_keywords")}>
            <TokenField
              values={filters.title_keywords}
              disabled={frozen}
              placeholder="Any title"
              onChange={(v) => set({ title_keywords: v }, "title_keywords")}
            />
          </Row>
        </div>
      </section>

      <section>
        <SectionLabel
          right={<span className="font-mono text-[11px] text-ink-3">{rubric.criteria.length} criteria</span>}
        >
          Fit rubric
        </SectionLabel>

        <p className="mb-2.5 rounded-lg border border-line bg-accent-soft/45 px-3 py-2 text-[12.5px] italic leading-relaxed text-accent-ink">
          {rubric.role_summary}
        </p>

        <div className="space-y-1.5">
          {rubric.criteria.map((c) => (
            <div key={c.id} className="group rounded-xl border border-line bg-panel px-3.5 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-semibold leading-snug text-ink">
                  {c.label}
                  {c.polarity === "negative" && (
                    <span className="ml-1.5 align-middle">
                      <Chip tone="danger">avoid</Chip>
                    </span>
                  )}
                </span>
                <div className="flex shrink-0 items-center gap-2 pt-1">
                  <WeightDots
                    weight={c.weight}
                    onChange={
                      frozen
                        ? undefined
                        : (w) =>
                            onRubric({
                              ...rubric,
                              criteria: rubric.criteria.map((x) => (x.id === c.id ? { ...x, weight: w } : x)),
                            })
                    }
                  />
                  {!frozen && (
                    <button
                      onClick={() =>
                        onRubric({ ...rubric, criteria: rubric.criteria.filter((x) => x.id !== c.id) })
                      }
                      className="rounded p-0.5 text-ink-3 opacity-0 transition hover:text-danger group-hover:opacity-100"
                      aria-label={`Remove ${c.label}`}
                    >
                      <Icon.Cross className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={c.description}
                readOnly={frozen}
                rows={2}
                onChange={(e) =>
                  onRubric({
                    ...rubric,
                    criteria: rubric.criteria.map((x) =>
                      x.id === c.id ? { ...x, description: e.target.value } : x,
                    ),
                  })
                }
                className="mt-1 w-full resize-none bg-transparent text-[12.5px] leading-relaxed text-ink-2 focus:outline-none"
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
