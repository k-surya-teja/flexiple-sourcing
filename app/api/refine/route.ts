import { NextResponse } from "next/server";
import { z } from "zod";
import { callLLM } from "@/lib/llm";
import { loadPrompt } from "@/lib/prompts";
import { applyOps, type LockKey } from "@/lib/ops";
import { Filters, RefineResult, Rubric } from "@/lib/schemas";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

const Shown = z.object({
  profile_id: z.string(),
  name: z.string(),
  current_title: z.string(),
  years_experience: z.number(),
  current_company: z.string(),
  current_company_type: z.string(),
  location: z.string(),
  score: z.number(),
});

const Body = z.object({
  query: z.string(),
  filters: Filters,
  rubric: Rubric,
  shown: z.array(Shown),
  message: z.string().trim().min(1).max(600),
  liked: z.array(z.string()).default([]),
  disliked: z.array(z.string()).default([]),
  locked: z.array(z.string()).default([]),
  history: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json(
      { error: { kind: "malformed", message: "That feedback could not be read. Try rephrasing it." } },
      { status: 400 },
    );
  }

  const b = body.data;
  const nameOf = (id: string) => b.shown.find((s) => s.profile_id === id)?.name ?? id;
  const posOf = (id: string) => b.shown.findIndex((s) => s.profile_id === id) + 1;

  const shown = b.shown
    .map(
      (s, i) =>
        `${i + 1}. ${s.name} — ${s.current_title}, ${s.years_experience} yrs, ${s.current_company} (${s.current_company_type}), ${s.location}. Current score ${s.score}.`,
    )
    .join("\n");

  const reactions = [
    b.liked.length ? `Explicitly marked as a match: ${b.liked.map((id) => `#${posOf(id)} ${nameOf(id)}`).join(", ")}.` : "",
    b.disliked.length ? `Explicitly marked as not a match: ${b.disliked.map((id) => `#${posOf(id)} ${nameOf(id)}`).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const { system, user } = loadPrompt("refine", {
    query: b.query,
    filters: JSON.stringify(b.filters, null, 1),
    rubric: JSON.stringify(b.rubric, null, 1),
    shown,
    message: b.message,
    reactions,
    locked: b.locked.length ? b.locked.join(", ") : "none",
    history: b.history.length
      ? `Earlier feedback this session, which still stands:\n${b.history.map((h) => `- "${h}"`).join("\n")}`
      : "",
  });

  const result = await callLLM({ system, user, schema: RefineResult, label: "refinement", maxTokens: 2200, temperature: 0.3 });
  if (!result.ok) return errorResponse(result.error);

  const next = applyOps(
    b.filters,
    b.rubric,
    result.data.filter_ops,
    result.data.rubric_ops,
    b.locked as LockKey[],
  );

  return NextResponse.json({
    interpretation: result.data.interpretation,
    filters: next.filters,
    rubric: next.rubric,
    applied: next.applied,
    meta: result.meta,
  });
}
