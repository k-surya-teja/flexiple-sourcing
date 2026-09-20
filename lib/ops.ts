import type { AppliedOp, FilterOp, Filters, Rubric, RubricOp } from "./schemas";
import { norm } from "./match";

/* Refinement arrives as a diff and is applied here, deterministically. Two
   things fall out of that: the "what changed and why" panel is just a render of
   the returned log, and a filter the recruiter edited by hand cannot be
   silently overwritten by the model.                                        */

export type LockKey =
  | "skills"
  | "years_experience"
  | "locations"
  | "company_background"
  | "title_keywords";

const FILTER_OP_LOCK: Record<FilterOp["kind"], LockKey> = {
  set_years: "years_experience",
  add_skill: "skills",
  remove_skill: "skills",
  set_locations: "locations",
  set_company_types: "company_background",
  set_title_keywords: "title_keywords",
};

const yearsLabel = (min: number | null, max: number | null) =>
  min === null && max === null ? "any" : `${min ?? "any"}–${max ?? "any"} yrs`;

export function applyOps(
  filters: Filters,
  rubric: Rubric,
  filterOps: FilterOp[],
  rubricOps: RubricOp[],
  locked: LockKey[] = [],
): { filters: Filters; rubric: Rubric; applied: AppliedOp[] } {
  const f: Filters = structuredClone(filters);
  const r: Rubric = structuredClone(rubric);
  const applied: AppliedOp[] = [];

  for (const op of filterOps) {
    if (locked.includes(FILTER_OP_LOCK[op.kind])) {
      applied.push({
        target: "filter",
        label: `${FILTER_OP_LOCK[op.kind].replace(/_/g, " ")} — left alone`,
        reason: `You edited this by hand, so the change was skipped: "${op.reason}"`,
        skipped: "locked",
      });
      continue;
    }

    switch (op.kind) {
      case "set_years": {
        const before = yearsLabel(f.years_experience.min, f.years_experience.max);
        f.years_experience = { min: op.min, max: op.max };
        applied.push({
          target: "filter",
          label: `Experience ${before} → ${yearsLabel(op.min, op.max)}`,
          reason: op.reason,
        });
        break;
      }
      case "add_skill": {
        const bucket = op.bucket === "all_of" ? f.skills_all_of : f.skills_any_of;
        if (!bucket.some((s) => norm(s) === norm(op.skill))) bucket.push(op.skill);
        applied.push({
          target: "filter",
          label: `Require ${op.skill}${op.bucket === "any_of" ? " (any of)" : ""}`,
          reason: op.reason,
        });
        break;
      }
      case "remove_skill": {
        f.skills_all_of = f.skills_all_of.filter((s) => norm(s) !== norm(op.skill));
        f.skills_any_of = f.skills_any_of.filter((s) => norm(s) !== norm(op.skill));
        applied.push({ target: "filter", label: `Drop ${op.skill} requirement`, reason: op.reason });
        break;
      }
      case "set_locations": {
        f.locations = op.locations;
        applied.push({
          target: "filter",
          label: `Location → ${op.locations.length ? op.locations.join(", ") : "anywhere"}`,
          reason: op.reason,
        });
        break;
      }
      case "set_company_types": {
        f.company_background = { types: op.types, scope: op.scope };
        applied.push({
          target: "filter",
          label: `Company background → ${op.types.length ? op.types.join(", ") : "any"} (${op.scope === "current" ? "current employer" : "current or past"})`,
          reason: op.reason,
        });
        break;
      }
      case "set_title_keywords": {
        f.title_keywords = op.keywords;
        applied.push({
          target: "filter",
          label: `Title → ${op.keywords.length ? op.keywords.join(", ") : "any"}`,
          reason: op.reason,
        });
        break;
      }
    }
  }

  for (const op of rubricOps) {
    switch (op.kind) {
      case "add_criterion": {
        if (r.criteria.some((c) => c.id === op.criterion.id)) {
          r.criteria = r.criteria.map((c) => (c.id === op.criterion.id ? op.criterion : c));
        } else {
          r.criteria.push(op.criterion);
        }
        applied.push({
          target: "rubric",
          label: `New criterion: ${op.criterion.label} (weight ${op.criterion.weight})`,
          reason: op.reason,
        });
        break;
      }
      case "remove_criterion": {
        const gone = r.criteria.find((c) => c.id === op.criterion_id);
        r.criteria = r.criteria.filter((c) => c.id !== op.criterion_id);
        if (gone) {
          applied.push({ target: "rubric", label: `Dropped: ${gone.label}`, reason: op.reason });
        }
        break;
      }
      case "reweight_criterion": {
        const c = r.criteria.find((x) => x.id === op.criterion_id);
        if (c) {
          applied.push({
            target: "rubric",
            label: `${c.label} weight ${c.weight} → ${op.weight}`,
            reason: op.reason,
          });
          c.weight = op.weight;
        }
        break;
      }
      case "edit_criterion": {
        const c = r.criteria.find((x) => x.id === op.criterion_id);
        if (c) {
          if (op.label) c.label = op.label;
          if (op.description) c.description = op.description;
          applied.push({ target: "rubric", label: `Refined: ${c.label}`, reason: op.reason });
        }
        break;
      }
    }
  }

  return { filters: f, rubric: r, applied };
}
