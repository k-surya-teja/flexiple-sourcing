import crypto from "node:crypto";
import { callLLM, mapLimit, type LLMError } from "./llm";
import { loadPrompt } from "./prompts";
import { verifyScore, type VerifiedScore } from "./evidence";
import { ScoreBatch, type Profile, type Rubric } from "./schemas";

/* Batched, cached, partially-failure-tolerant scoring.

   Batching: one request per BATCH_SIZE profiles rather than one per profile.
   48 individual calls would be slow and would trip the free-tier rate limit
   immediately.

   Caching: keyed on the rubric, so a refinement round that only tightens a
   *filter* re-uses every score it already has and returns almost instantly.
   That is most of why refinement feels responsive rather than like a new search.

   Partial failure: one dead batch does not kill the round. The profiles it
   covered come back as `unscored` and the UI says so plainly.               */

/* Sized against Groq's free tier, which is token-per-minute limited (8k/min on
   a new key) rather than request limited. Two 4k-token calls in flight blow the
   whole minute's budget at once and every subsequent call 429s, so scoring runs
   one batch at a time with a modest output cap.

   Batch size is a token trade, not a latency one: the system prompt is resent
   with every batch, so *larger* batches spend fewer total tokens. Completion
   tokens scale with profile count either way. Six is where the per-batch
   response still fits comfortably under the output cap. Throughput here is
   bounded by the account's tokens-per-minute, not by the code. */
const BATCH_SIZE = 6;
const CONCURRENCY = 1;
/** Whole-run budget. Past this, remaining batches fail fast and their profiles
    come back as unscored rather than the recruiter watching a spinner. */
const RUN_BUDGET_MS = 60_000;

const cache = new Map<string, VerifiedScore>();

export const rubricHash = (r: Rubric) =>
  crypto.createHash("sha1").update(JSON.stringify(r)).digest("hex").slice(0, 12);

const chunk = <T,>(xs: T[], n: number) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

function renderCriteria(rubric: Rubric): string {
  return rubric.criteria
    .map(
      (c) =>
        `- id: ${c.id} | ${c.label} | weight ${c.weight}/5 | ${c.polarity}\n  ${c.description}`,
    )
    .join("\n");
}

export type ScoreRun = {
  scores: VerifiedScore[];
  unscored: Profile[];
  /** Set when at least one batch failed; the round still returns. */
  degraded?: LLMError;
  stats: { fromCache: number; scored: number; batches: number };
};

export async function scoreProfiles(profiles: Profile[], rubric: Rubric): Promise<ScoreRun> {
  const deadline = Date.now() + RUN_BUDGET_MS;
  const hash = rubricHash(rubric);
  const scores: VerifiedScore[] = [];
  const todo: Profile[] = [];

  for (const p of profiles) {
    const hit = cache.get(`${hash}:${p.id}`);
    if (hit) scores.push(hit);
    else todo.push(p);
  }
  const fromCache = scores.length;

  const batches = chunk(todo, BATCH_SIZE);
  const unscored: Profile[] = [];
  let degraded: LLMError | undefined;

  const results = await mapLimit(batches, CONCURRENCY, async (batch) => {
    const { system, user } = loadPrompt("score", {
      role_summary: rubric.role_summary,
      criteria: renderCriteria(rubric),
      // Contact details are stripped: not scoring signal, and not something to
      // hand a model that might echo it back inside an explanation.
      profiles: JSON.stringify(
        batch.map(({ linkedin: _l, email: _e, ...scoreable }) => scoreable),
      ),
    });
    return {
      batch,
      result: await callLLM({
        system,
        user,
        schema: ScoreBatch,
        label: "scoring",
        maxTokens: 2600,
        deadline,
      }),
    };
  });

  for (const { batch, result } of results) {
    if (!result.ok) {
      degraded ??= result.error;
      unscored.push(...batch);
      continue;
    }
    const byId = new Map(batch.map((p) => [p.id, p]));
    const seen = new Set<string>();

    for (const raw of result.data.scores) {
      const profile = byId.get(raw.profile_id);
      if (!profile || seen.has(raw.profile_id)) continue; // ignore invented ids
      seen.add(raw.profile_id);
      const verified = verifyScore(profile, raw);
      cache.set(`${hash}:${profile.id}`, verified);
      scores.push(verified);
    }
    // A profile the model skipped is unscored, not silently dropped.
    unscored.push(...batch.filter((p) => !seen.has(p.id)));
  }

  scores.sort((a, b) => b.score - a.score);
  return {
    scores,
    unscored,
    degraded,
    stats: { fromCache, scored: scores.length - fromCache, batches: batches.length },
  };
}
