import { NextResponse } from "next/server";
import { z } from "zod";
import { allProfiles } from "@/lib/pool";
import { applyFilters } from "@/lib/filter";
import { scoreProfiles } from "@/lib/score";
import { Filters, Rubric } from "@/lib/schemas";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

/** Keeps a wide search from turning into a 40-second wait. Surfaced in the UI
    rather than hidden, so the recruiter knows the list is not the whole pool. */
const MAX_SCORED = 24;

const Body = z.object({ filters: Filters, rubric: Rubric });

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: { kind: "malformed", message: "The search criteria were not in the expected shape." } },
      { status: 400 },
    );
  }

  const { filters, rubric } = body.data;
  const outcome = applyFilters(allProfiles(), filters);

  // No survivors means no reason to call the model at all: the empty state is
  // instant and free, and we can say which clause did the damage.
  if (outcome.matched.length === 0) {
    return NextResponse.json({
      results: [],
      pool: { matched: 0, totalPool: outcome.totalPool, eliminatedBy: outcome.eliminatedBy },
      unscored: [],
      truncated: 0,
    });
  }

  const toScore = outcome.matched.slice(0, MAX_SCORED);
  const run = await scoreProfiles(toScore, rubric);

  // Every batch failed — there is nothing to show, so this is a real error.
  if (run.scores.length === 0 && run.degraded) return errorResponse(run.degraded);

  const byId = new Map(allProfiles().map((p) => [p.id, p]));
  const results = run.scores
    .map((s) => ({ profile: byId.get(s.profile_id)!, score: s }))
    .filter((r) => r.profile);

  return NextResponse.json({
    results,
    pool: {
      matched: outcome.matched.length,
      totalPool: outcome.totalPool,
      eliminatedBy: outcome.eliminatedBy,
    },
    unscored: run.unscored.map((p) => ({ id: p.id, name: p.name })),
    degraded: run.degraded ?? null,
    truncated: Math.max(0, outcome.matched.length - toScore.length),
    stats: run.stats,
  });
}
