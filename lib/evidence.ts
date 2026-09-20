import type { CriterionAssessment, Evidence, Profile, ProfileScore } from "./schemas";
import { norm, skillMatches } from "./match";

/* The anti-hallucination guard. The model must name the field every claim came
   from; here we check the value is actually there. Claims that fail are dropped
   before they ever reach the screen, so a recruiter never reads a detail the
   profile does not support. This is structural: no amount of prompt wording
   makes a model perfectly honest, but a claim it cannot substantiate is simply
   not rendered.                                                              */

export type VerifiedEvidence = Evidence & { verified: boolean };
export type VerifiedAssessment = Omit<CriterionAssessment, "evidence"> & {
  evidence: VerifiedEvidence[];
  /** met is yes/partial and at least one citation checked out. */
  grounded: boolean;
};
export type VerifiedScore = Omit<ProfileScore, "assessments"> & {
  assessments: VerifiedAssessment[];
  claims: { verified: number; dropped: number };
};

function evidenceHolds(profile: Profile, e: Evidence): boolean {
  const v = e.value.trim();
  if (!v) return false;

  switch (e.field) {
    case "skills":
      return skillMatches(v, profile.skills);
    case "years_experience": {
      const digits = v.match(/\d+/)?.[0];
      return digits !== undefined && Number(digits) === profile.years_experience;
    }
    case "past_companies":
      return profile.past_companies.some(
        (c) =>
          norm(c.company).includes(norm(v)) ||
          norm(v).includes(norm(c.company)) ||
          norm(c.title).includes(norm(v)),
      );
    case "current_company_type":
      return norm(profile.current_company_type) === norm(v);
    default:
      return norm(String(profile[e.field])).includes(norm(v));
  }
}

export function verifyScore(profile: Profile, score: ProfileScore): VerifiedScore {
  let verified = 0;
  let dropped = 0;

  const assessments: VerifiedAssessment[] = score.assessments.map((a) => {
    const evidence = a.evidence.map((e) => {
      const ok = evidenceHolds(profile, e);
      ok ? verified++ : dropped++;
      return { ...e, verified: ok };
    });
    return {
      ...a,
      evidence,
      grounded: a.met !== "no" && evidence.some((e) => e.verified),
    };
  });

  return { ...score, assessments, claims: { verified, dropped } };
}
