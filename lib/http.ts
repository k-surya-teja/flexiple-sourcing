import { NextResponse } from "next/server";
import type { LLMError } from "./llm";

const STATUS: Record<LLMError["kind"], number> = {
  missing_key: 500,
  rate_limit: 429,
  timeout: 504,
  upstream: 502,
  malformed: 502,
  truncated: 502,
  empty: 502,
};

/** One error shape for the whole API, so the client has one thing to render. */
export function errorResponse(error: LLMError) {
  return NextResponse.json({ error }, { status: STATUS[error.kind] ?? 500 });
}
