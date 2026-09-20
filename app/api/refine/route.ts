import { NextResponse } from "next/server";
import { z } from "zod";
import { callLLM } from "@/lib/llm";
import { loadPrompt } from "@/lib/prompts";
import { applyOps, type LockKey } from "@/lib/ops";
import { Filters, RefineResult, Rubric } from "@/lib/schemas";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

/* Feedback accumulates across a long session, but the prompt has a token budget
   — especially on a free tier capped at 8k tokens a minute. Trimming is
   unavoidable; trimming *silently* is the bug. A constraint the recruiter set
   three rounds ago and still believes is in force must not simply vanish from
   the model's view, so when older rounds are left out we say so and point at
   where their effect already lives. */
const HISTORY_BUDGET_CHARS = 1100;

function renderHistory(history: string[]): string {
  if (!history.length) return "";

  const kept: string[] = [];
  let used = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const line = `- "${history[i]}"`;
    if (kept.length && used + line.length > HISTORY_BUDGET_CHARS) break;
    kept.unshift(line);
    used += line.length;
  }

  const omitted = history.length - kept.length;
  const preface = omitted
    ? `Earlier feedback this session, which still stands. ${omitted} earlier round${omitted === 1 ? "" : "s"} ${omitted === 1 ? "is" : "are"} not shown here, but ${omitted === 1 ? "its" : "their"} effect is already encoded in the filters and rubric above — do not undo a constraint just because you cannot see where it came from.`
    : "Earlier feedback this session, which still stands:";

  return `${preface}\n${kept.join("\n")}`;
}

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
    history: renderHistory(b.history),
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
