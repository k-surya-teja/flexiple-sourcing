import type { Filters, Profile } from "./schemas";
import { skillMatches, locationMatches, titleMatches } from "./match";

/* Pure, synchronous, no network. The LLM writes filters; it never applies them. */

export type FilterKey =
  | "skills_all_of"
  | "skills_any_of"
  | "years_experience"
  | "locations"
  | "company_background"
  | "title_keywords";

export type FilterOutcome = {
  matched: Profile[];
  /** Per-filter count of how many profiles that clause alone eliminates.
      Drives the empty state: we can name the clause that is costing the most. */
  eliminatedBy: Record<FilterKey, number>;
  totalPool: number;
};

function failures(profile: Profile, f: Filters): FilterKey[] {
  const failed: FilterKey[] = [];

  if (f.skills_all_of.length && !f.skills_all_of.every((s) => skillMatches(s, profile.skills))) {
    failed.push("skills_all_of");
  }
  if (f.skills_any_of.length && !f.skills_any_of.some((s) => skillMatches(s, profile.skills))) {
    failed.push("skills_any_of");
  }

  const { min, max } = f.years_experience;
  if ((min !== null && profile.years_experience < min) || (max !== null && profile.years_experience > max)) {
    failed.push("years_experience");
  }

  if (f.locations.length && !f.locations.some((l) => locationMatches(l, profile.location))) {
    failed.push("locations");
  }

  const { types, scope } = f.company_background;
  if (types.length) {
    const pool =
      scope === "current"
        ? [profile.current_company_type]
        : [profile.current_company_type, ...profile.past_companies.map((c) => c.company_type)];
    if (!pool.some((t) => types.includes(t))) failed.push("company_background");
  }

  if (f.title_keywords.length && !f.title_keywords.some((k) => titleMatches(k, profile.current_title))) {
    failed.push("title_keywords");
  }

  return failed;
}

export function applyFilters(profiles: Profile[], f: Filters): FilterOutcome {
  const eliminatedBy: Record<FilterKey, number> = {
    skills_all_of: 0,
    skills_any_of: 0,
    years_experience: 0,
    locations: 0,
    company_background: 0,
    title_keywords: 0,
  };
  const matched: Profile[] = [];

  for (const p of profiles) {
    const failed = failures(p, f);
    for (const k of failed) eliminatedBy[k] += 1;
    if (!failed.length) matched.push(p);
  }

  return { matched, eliminatedBy, totalPool: profiles.length };
}

export const FILTER_LABELS: Record<FilterKey, string> = {
  skills_all_of: "Must have all skills",
  skills_any_of: "Must have one of these skills",
  years_experience: "Years of experience",
  locations: "Location",
  company_background: "Company background",
  title_keywords: "Title",
};
