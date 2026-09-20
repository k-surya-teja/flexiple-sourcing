import type { ZodType } from "zod";

/* Every LLM interaction in this app goes through callLLM. Timeouts, rate
   limits, malformed JSON and schema drift are handled here exactly once,
   so route handlers only ever branch on a typed error.                  */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
/** Tried in order if the primary model is decommissioned or overloaded. */
const FALLBACK_MODELS = ["llama-3.1-8b-instant"];

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RATE_LIMIT_RETRIES = 2;

export type LLMErrorKind =
  | "missing_key"
  | "rate_limit"
  | "timeout"
  | "upstream"
  | "malformed"
  | "empty";

export type LLMError = {
  kind: LLMErrorKind;
  message: string;
  /** Seconds to wait, when the provider told us. */
  retryAfter?: number;
  /** Raw model text, kept for the debug drawer. */
  raw?: string;
};

export type LLMResult<T> =
  | { ok: true; data: T; meta: { model: string; ms: number; repaired: boolean } }
  | { ok: false; error: LLMError };

export class LLMFailure extends Error {
  constructor(public error: LLMError) {
    super(error.message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Models like to wrap JSON in prose or fences. Pull out the object. */
function extractJSON(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  return body.slice(start, end + 1);
}

type RawCall = {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
};

/** One HTTP round trip, with timeout + 429/5xx retry. Returns model text. */
async function rawCompletion(
  { system, user, temperature = 0.2, maxTokens = 4096 }: RawCall,
  model: string,
): Promise<{ text: string; model: string }> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new LLMFailure({
      kind: "missing_key",
      message: "GROQ_API_KEY is not set. Add it to .env.local and restart the dev server.",
    });
  }

  let attempt = 0;
  for (;;) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof Error && e.name === "AbortError") {
        throw new LLMFailure({
          kind: "timeout",
          message: `The model took longer than ${REQUEST_TIMEOUT_MS / 1000}s to respond.`,
        });
      }
      throw new LLMFailure({
        kind: "upstream",
        message: e instanceof Error ? e.message : "Network error reaching Groq.",
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      if (attempt < MAX_RATE_LIMIT_RETRIES) {
        // Respect Retry-After when present, otherwise exponential + jitter.
        const waitMs = retryAfter
          ? retryAfter * 1000
          : 2 ** attempt * 1000 + Math.random() * 400;
        attempt += 1;
        await sleep(Math.min(waitMs, 10_000));
        continue;
      }
      throw new LLMFailure({
        kind: "rate_limit",
        message: "Groq rate limit reached. The free tier allows a burst, then asks you to wait.",
        retryAfter: retryAfter || 20,
      });
    }

    if (res.status >= 500) {
      if (attempt < 1) {
        attempt += 1;
        await sleep(800);
        continue;
      }
      throw new LLMFailure({
        kind: "upstream",
        message: `Groq returned ${res.status}. The provider is having a moment.`,
      });
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new LLMFailure({
        kind: "upstream",
        message: `Groq returned ${res.status}: ${body.slice(0, 200)}`,
      });
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) {
      throw new LLMFailure({ kind: "empty", message: "The model returned an empty response." });
    }
    return { text, model };
  }
}

/**
 * Ask the model for JSON and refuse to return anything that does not satisfy
 * `schema`. On a schema miss we hand the validation error straight back to the
 * model once — cheaper and far more reliable than a blind retry.
 */
export async function callLLM<T>(
  call: RawCall & { schema: ZodType<T>; label: string },
): Promise<LLMResult<T>> {
  const started = Date.now();
  const models = [MODEL, ...FALLBACK_MODELS];

  try {
    let lastFailure: LLMFailure | null = null;

    for (const model of models) {
      let text: string;
      try {
        ({ text } = await rawCompletion(call, model));
      } catch (e) {
        if (e instanceof LLMFailure && e.error.kind === "upstream" && model !== models.at(-1)) {
          lastFailure = e;
          continue; // decommissioned or overloaded model — try the next one
        }
        throw e;
      }

      for (let repair = 0; repair <= 1; repair++) {
        const candidate = extractJSON(text);
        const parsed = candidate
          ? call.schema.safeParse(safeJSONParse(candidate))
          : null;

        if (parsed?.success) {
          return {
            ok: true,
            data: parsed.data,
            meta: { model, ms: Date.now() - started, repaired: repair > 0 },
          };
        }

        if (repair === 1) break; // already gave it one corrected shot

        const problem = parsed
          ? parsed.error.issues
              .slice(0, 8)
              .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
              .join("\n")
          : "- the response was not valid JSON at all";

        ({ text } = await rawCompletion(
          {
            ...call,
            user: `${call.user}\n\nYour previous response was rejected by schema validation:\n${problem}\n\nPrevious response:\n${text.slice(0, 2000)}\n\nReturn corrected JSON only. No prose, no code fences.`,
            temperature: 0,
          },
          model,
        ));
      }

      lastFailure = new LLMFailure({
        kind: "malformed",
        message: `The model's ${call.label} response did not match the expected shape, twice.`,
        raw: text.slice(0, 600),
      });
    }

    throw lastFailure ?? new LLMFailure({ kind: "empty", message: "No model produced a response." });
  } catch (e) {
    if (e instanceof LLMFailure) return { ok: false, error: e.error };
    return {
      ok: false,
      error: { kind: "upstream", message: e instanceof Error ? e.message : "Unknown error." },
    };
  }
}

function safeJSONParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    // Trailing commas are the single most common malformation.
    try {
      return JSON.parse(s.replace(/,(\s*[}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}

/** Bounded-concurrency map, so batch scoring does not trip the rate limit. */
export async function mapLimit<A, B>(
  items: A[],
  limit: number,
  fn: (item: A, index: number) => Promise<B>,
): Promise<B[]> {
  const out = new Array<B>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
