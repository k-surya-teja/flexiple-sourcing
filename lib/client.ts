import type { AppliedOp, Filters, Profile, Rubric } from "./schemas";
import type { VerifiedScore } from "./evidence";
import type { FilterKey } from "./filter";

export type LLMErrorShape = {
  kind: "missing_key" | "rate_limit" | "timeout" | "upstream" | "malformed" | "empty";
  message: string;
  retryAfter?: number;
  raw?: string;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: LLMErrorShape };

export type PoolInfo = {
  matched: number;
  totalPool: number;
  eliminatedBy: Record<FilterKey, number>;
};

export type AnalyzeResponse = {
  interpretation: string;
  filters: Filters;
  rubric: Rubric;
  preview: PoolInfo;
};

export type SearchResult = { profile: Profile; score: VerifiedScore };

export type SearchResponse = {
  results: SearchResult[];
  pool: PoolInfo;
  unscored: { id: string; name: string }[];
  degraded: LLMErrorShape | null;
  truncated: number;
  stats?: { fromCache: number; scored: number; batches: number };
};

export type RefineResponse = {
  interpretation: string;
  filters: Filters;
  rubric: Rubric;
  applied: AppliedOp[];
};

async function post<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: (json?.error as LLMErrorShape) ?? {
          kind: "upstream",
          message: `The server returned ${res.status}.`,
        },
      };
    }
    return { ok: true, data: json as T };
  } catch {
    return {
      ok: false,
      error: { kind: "upstream", message: "Could not reach the server. Is the dev server still running?" },
    };
  }
}

export const analyze = (query: string) => post<AnalyzeResponse>("/api/analyze", { query });

export const search = (filters: Filters, rubric: Rubric) =>
  post<SearchResponse>("/api/search", { filters, rubric });

export const refine = (body: {
  query: string;
  filters: Filters;
  rubric: Rubric;
  shown: {
    profile_id: string;
    name: string;
    current_title: string;
    years_experience: number;
    current_company: string;
    current_company_type: string;
    location: string;
    score: number;
  }[];
  message: string;
  liked: string[];
  disliked: string[];
  locked: string[];
  history: string[];
}) => post<RefineResponse>("/api/refine", body);
