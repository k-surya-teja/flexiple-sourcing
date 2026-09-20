import { z } from "zod";

/* ─────────────────────────── Talent pool ─────────────────────────── */

export const CompanyType = z.enum(["startup", "scaleup", "enterprise", "agency"]);
export type CompanyType = z.infer<typeof CompanyType>;

export const PastCompany = z.object({
  company: z.string(),
  company_type: CompanyType,
  title: z.string(),
  years: z.number(),
});

export const Profile = z.object({
  id: z.string(),
  name: z.string(),
  current_title: z.string(),
  years_experience: z.number(),
  location: z.string(),
  current_company: z.string(),
  current_company_type: CompanyType,
  skills: z.array(z.string()),
  past_companies: z.array(PastCompany),
  education: z.string(),
  summary: z.string(),
  /* Optional so a profiles.json without them still validates — the brief's
     schema does not include contact details, and this file must stay a drop-in
     replacement. Never sent to the model: they are not evidence of fit, they
     cost tokens, and a model given an address will eventually quote one. */
  linkedin: z.string().optional(),
  email: z.string().optional(),
});
export type Profile = z.infer<typeof Profile>;

/** The only profile fields an explanation is allowed to cite. */
export const CITABLE_FIELDS = [
  "current_title",
  "years_experience",
  "location",
  "current_company",
  "current_company_type",
  "skills",
  "past_companies",
  "education",
  "summary",
] as const;
export const CitableField = z.enum(CITABLE_FIELDS);
export type CitableField = z.infer<typeof CitableField>;

/* ──────────────────────── Objective filters ───────────────────────
   Applied deterministically in lib/filter.ts. The LLM writes these;
   it never applies them. At 98M profiles this becomes the SQL/vector
   query and the LLM only ever sees what survives.                    */

export const Filters = z.object({
  skills_all_of: z.array(z.string()).default([]),
  skills_any_of: z.array(z.string()).default([]),
  years_experience: z
    .object({ min: z.number().nullable(), max: z.number().nullable() })
    .default({ min: null, max: null }),
  locations: z.array(z.string()).default([]),
  company_background: z
    .object({
      types: z.array(CompanyType).default([]),
      /** "current" = present employer only. "any" = current or past. */
      scope: z.enum(["current", "any"]).default("any"),
    })
    .default({ types: [], scope: "any" }),
  title_keywords: z.array(z.string()).default([]),
});
export type Filters = z.infer<typeof Filters>;

export const EMPTY_FILTERS: Filters = {
  skills_all_of: [],
  skills_any_of: [],
  years_experience: { min: null, max: null },
  locations: [],
  company_background: { types: [], scope: "any" },
  title_keywords: [],
};

/* ───────────────────────── Subjective rubric ───────────────────────── */

export const RubricCriterion = z.object({
  id: z
    .string()
    .transform((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")),
  label: z.string(),
  description: z.string(),
  /** 1 = nice to have, 5 = defining. */
  weight: z.number().int().min(1).max(5),
  polarity: z.enum(["positive", "negative"]).default("positive"),
});
export type RubricCriterion = z.infer<typeof RubricCriterion>;

export const Rubric = z.object({
  role_summary: z.string(),
  criteria: z.array(RubricCriterion).min(1).max(8),
});
export type Rubric = z.infer<typeof Rubric>;

/* ──────────────── LLM call #1 — free text → criteria ──────────────── */

export const AnalyzeResult = z.object({
  interpretation: z.string(),
  filters: Filters,
  rubric: Rubric,
});
export type AnalyzeResult = z.infer<typeof AnalyzeResult>;

/* ─────────────── LLM call #2 — score survivors vs rubric ───────────────
   Every claim must name a profile field. lib/evidence.ts then checks the
   value actually appears there; unverified claims are dropped, not shown. */

export const Evidence = z.object({
  field: CitableField,
  value: z.string(),
});
export type Evidence = z.infer<typeof Evidence>;

export const CriterionAssessment = z.object({
  criterion_id: z.string(),
  met: z.enum(["yes", "partial", "no"]),
  evidence: z.array(Evidence).default([]),
});
export type CriterionAssessment = z.infer<typeof CriterionAssessment>;

export const ProfileScore = z.object({
  profile_id: z.string(),
  score: z.number().min(0).max(100),
  verdict: z.enum(["strong", "possible", "weak"]),
  headline: z.string(),
  assessments: z.array(CriterionAssessment).default([]),
});
export type ProfileScore = z.infer<typeof ProfileScore>;

export const ScoreBatch = z.object({ scores: z.array(ProfileScore) });

/* ─────────── LLM call #3 — feedback → patch operations ───────────
   Refinement returns a DIFF, never a regenerated rubric. This is what
   makes "here is what I changed and why" free to render, and what stops
   the model silently discarding a filter the recruiter set by hand.   */

const withReason = { reason: z.string() };

export const FilterOp = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("set_years"), min: z.number().nullable(), max: z.number().nullable(), ...withReason }),
  z.object({ kind: z.literal("add_skill"), bucket: z.enum(["all_of", "any_of"]), skill: z.string(), ...withReason }),
  z.object({ kind: z.literal("remove_skill"), skill: z.string(), ...withReason }),
  z.object({ kind: z.literal("set_locations"), locations: z.array(z.string()), ...withReason }),
  z.object({ kind: z.literal("set_company_types"), types: z.array(CompanyType), scope: z.enum(["current", "any"]), ...withReason }),
  z.object({ kind: z.literal("set_title_keywords"), keywords: z.array(z.string()), ...withReason }),
]);
export type FilterOp = z.infer<typeof FilterOp>;

export const RubricOp = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add_criterion"), criterion: RubricCriterion, ...withReason }),
  z.object({ kind: z.literal("remove_criterion"), criterion_id: z.string(), ...withReason }),
  z.object({ kind: z.literal("reweight_criterion"), criterion_id: z.string(), weight: z.number().int().min(1).max(5), ...withReason }),
  z.object({ kind: z.literal("edit_criterion"), criterion_id: z.string(), label: z.string().optional(), description: z.string().optional(), ...withReason }),
]);
export type RubricOp = z.infer<typeof RubricOp>;

export const RefineResult = z.object({
  /** Played back to the recruiter so they can see they were understood. */
  interpretation: z.string(),
  filter_ops: z.array(FilterOp).default([]),
  rubric_ops: z.array(RubricOp).default([]),
});
export type RefineResult = z.infer<typeof RefineResult>;

/* ─────────────────────── Client-held session state ─────────────────────── */

export type AppliedOp = {
  target: "filter" | "rubric";
  label: string;
  reason: string;
  skipped?: "locked";
};

export type RoundFeedback = {
  message: string;
  liked: string[];
  disliked: string[];
};
