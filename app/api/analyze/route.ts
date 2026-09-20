import { NextResponse } from "next/server";
import { z } from "zod";
import { callLLM } from "@/lib/llm";
import { loadPrompt } from "@/lib/prompts";
import { allProfiles, vocabulary } from "@/lib/pool";
import { applyFilters } from "@/lib/filter";
import { AnalyzeResult } from "@/lib/schemas";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

const Body = z.object({ query: z.string().trim().min(3).max(600) });

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: { kind: "malformed", message: "Describe the role in a sentence or two." } },
      { status: 400 },
    );
  }

  const { skills, locations } = vocabulary();
  const { system, user } = loadPrompt("analyze", {
    query: body.data.query,
    skill_vocabulary: skills.join(", "),
    location_vocabulary: locations.join(", "),
  });

  const result = await callLLM({ system, user, schema: AnalyzeResult, label: "criteria", maxTokens: 2200 });
  if (!result.ok) return errorResponse(result.error);

  // Free preview: filtering is pure code, so we can tell the recruiter how many
  // people survive before spending a single token on scoring.
  const outcome = applyFilters(allProfiles(), result.data.filters);

  return NextResponse.json({
    ...result.data,
    preview: {
      matched: outcome.matched.length,
      totalPool: outcome.totalPool,
      eliminatedBy: outcome.eliminatedBy,
    },
    meta: result.meta,
  });
}
