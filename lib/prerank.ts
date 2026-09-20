import type { Filters, Profile, Rubric } from "./schemas";
import { norm } from "./match";

/* Why this exists.

   Only MAX_SCORED profiles can be scored per round — the token budget does not
   stretch further. Taking the first N in dataset order is quietly catastrophic
   when the filters are loose: a search for "senior frontend engineers who have
   owned a design system" generates no hard skill filter (correctly — that is a
   judgement, not a constraint), so 38 profiles survive, and the first 15 happen
   to be backend engineers. Every frontend candidate is dropped before the model
   ever sees them, and the recruiter is shown a confidently ranked list of the
   wrong people.

   So before truncating, order the survivors by a cheap lexical signal drawn
   from the rubric the LLM just wrote. This is pure code, costs nothing, and
   never decides who is *good* — it only decides who is worth spending a scoring
   token on. The LLM still does all the judging. */

const STOPWORDS = new Set([
  "the","and","for","with","that","this","have","has","from","their","who","their","are","was",
  "not","but","its","it's","a","an","of","in","on","to","at","by","or","as","is","be","been",
  "candidate","candidates","profile","profiles","experience","experienced","evidence","shows",
  "demonstrates","strong","good","role","work","worked","working","years","year","including",
  "e.g","such","more","than","any","all","one","two","using","use","used","able","ability",
]);

const tokenize = (s: string) =>
  norm(s)
    .split(/[^a-z0-9.+#]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));

/** Weighted keyword bag from what the recruiter actually asked for. */
function keywordWeights(filters: Filters, rubric: Rubric): Map<string, number> {
  const w = new Map<string, number>();
  const add = (text: string, weight: number) => {
    for (const t of tokenize(text)) w.set(t, Math.max(w.get(t) ?? 0, weight));
  };

  // Skills named in filters are the strongest signal available.
  for (const s of [...filters.skills_all_of, ...filters.skills_any_of]) add(s, 6);
  for (const k of filters.title_keywords) add(k, 5);

  add(rubric.role_summary, 3);
  for (const c of rubric.criteria) {
    // A negative criterion describes what to avoid, so its words must not pull
    // a profile up the queue.
    if (c.polarity === "negative") continue;
    add(c.label, c.weight);
    add(c.description, Math.max(1, c.weight - 1));
  }
  return w;
}

function profileText(p: Profile): { strong: string; weak: string } {
  return {
    // Title and skills are declarative; the summary is prose and noisier.
    strong: [p.current_title, ...p.skills, ...p.past_companies.map((c) => c.title)].join(" "),
    weak: [p.summary, p.education, p.current_company].join(" "),
  };
}

/**
 * Order survivors by how well they echo the rubric's vocabulary, so the
 * profiles that get scored are the ones worth scoring. Ties keep dataset order,
 * so the result is deterministic.
 */
export function prerank(profiles: Profile[], filters: Filters, rubric: Rubric): Profile[] {
  const weights = keywordWeights(filters, rubric);
  if (weights.size === 0) return profiles;

  const scored = profiles.map((p, index) => {
    const { strong, weak } = profileText(p);
    const strongTokens = new Set(tokenize(strong));
    const weakTokens = new Set(tokenize(weak));

    let score = 0;
    for (const [term, weight] of weights) {
      if (strongTokens.has(term)) score += weight;
      else if (weakTokens.has(term)) score += weight * 0.4;
    }
    return { p, score, index };
  });

  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.p);
}
