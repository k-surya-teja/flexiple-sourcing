"use client";

import { useCallback, useRef, useState } from "react";
import { SearchScreen } from "@/components/SearchScreen";
import { CriteriaPanel } from "@/components/CriteriaPanel";
import { ResultsPanel } from "@/components/ResultsPanel";
import { ChatPanel, type Message } from "@/components/ChatPanel";
import { FrozenView } from "@/components/FrozenView";
import { Icon } from "@/components/Primitives";
import { ThemeToggle } from "@/components/ThemeToggle";
import { analyze, refine, search, type LLMErrorShape, type SearchResponse } from "@/lib/client";
import type { Filters, Rubric } from "@/lib/schemas";
import type { LockKey } from "@/lib/ops";

type Phase = "search" | "workspace" | "frozen";
type Busy = null | "analyze" | "search" | "refine";

const uid = () => Math.random().toString(36).slice(2, 9);

/** Omit distributed over the Message union, so each variant keeps its own shape. */
type Draft<T> = T extends unknown ? Omit<T, "id"> : never;

/* All session state lives here, on the client, and is posted with each request.
   The server stays stateless apart from its score cache. Next's dev hot-reload
   wipes module state on every save, so a server-side session map would have
   been a steady source of ghost bugs for no benefit the brief asks for.      */

export default function Page() {
  const [phase, setPhase] = useState<Phase>("search");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters | null>(null);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [locked, setLocked] = useState<Set<LockKey>>(new Set());
  const [reactions, setReactions] = useState<Record<string, "yes" | "no">>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [analyzeError, setAnalyzeError] = useState<LLMErrorShape | null>(null);
  const [searchError, setSearchError] = useState<LLMErrorShape | null>(null);
  const [dirty, setDirty] = useState(false);
  const [rounds, setRounds] = useState(0);

  const history = useRef<string[]>([]);
  /** The last failed step, so every error card has a working retry. */
  const retry = useRef<(() => void) | null>(null);
  /* Monotonic request id. Rounds can take anywhere from 200ms (all cache hits)
     to 30s (waiting out a rate limit), so a slow early request can land after a
     fast later one and overwrite it with results for criteria the recruiter has
     already changed. Only the newest request is allowed to write state. */
  const searchSeq = useRef(0);

  const say = (m: Draft<Message>) => setMessages((prev) => [...prev, { ...m, id: uid() } as Message]);

  const runSearch = useCallback(async (f: Filters, r: Rubric) => {
    const seq = ++searchSeq.current;
    setBusy("search");
    setSearchError(null);
    setDirty(false);

    const res = await search(f, r);
    if (seq !== searchSeq.current) return; // superseded by a newer search

    setBusy(null);
    if (!res.ok) {
      setSearchError(res.error);
      retry.current = () => void runSearch(f, r);
      return;
    }
    setResults(res.data);
  }, []);

  const start = useCallback(
    async (q: string) => {
      setQuery(q);
      setBusy("analyze");
      setAnalyzeError(null);

      const res = await analyze(q);
      if (!res.ok) {
        setBusy(null);
        setAnalyzeError(res.error);
        retry.current = () => void start(q);
        return;
      }

      const { filters: f, rubric: r, interpretation, preview } = res.data;
      setFilters(f);
      setRubric(r);
      setLocked(new Set());
      setReactions({});
      setRounds(0);
      history.current = [];
      setMessages([
        { id: uid(), role: "assistant", kind: "note", text: interpretation },
        {
          id: uid(),
          role: "assistant",
          kind: "note",
          text: `${preview.matched} of ${preview.totalPool} profiles clear these filters. Scoring them against the rubric now — tell me what's wrong with the results and I'll adjust.`,
        },
      ]);
      setPhase("workspace");
      await runSearch(f, r);
    },
    [runSearch],
  );

  const sendFeedback = useCallback(
    async (text: string) => {
      if (!filters || !rubric || !results) return;

      say({ role: "recruiter", text });
      setBusy("refine");

      const liked = Object.entries(reactions).filter(([, v]) => v === "yes").map(([k]) => k);
      const disliked = Object.entries(reactions).filter(([, v]) => v === "no").map(([k]) => k);

      const res = await refine({
        query,
        filters,
        rubric,
        shown: results.results.slice(0, 5).map((r) => ({
          profile_id: r.profile.id,
          name: r.profile.name,
          current_title: r.profile.current_title,
          years_experience: r.profile.years_experience,
          current_company: r.profile.current_company,
          current_company_type: r.profile.current_company_type,
          location: r.profile.location,
          score: r.score.score,
        })),
        message: text,
        liked,
        disliked,
        locked: [...locked],
        history: history.current,
      });

      setBusy(null);

      if (!res.ok) {
        say({ role: "assistant", kind: "error", error: res.error });
        retry.current = () => void sendFeedback(text);
        return;
      }

      // Kept in full. The refine route trims to a token budget and tells the
      // model when older rounds were left out, rather than dropping them mutely.
      history.current = [...history.current, text];
      setFilters(res.data.filters);
      setRubric(res.data.rubric);
      setReactions({});
      setRounds((n) => n + 1);
      say({ role: "assistant", kind: "diff", text: res.data.interpretation, applied: res.data.applied });

      await runSearch(res.data.filters, res.data.rubric);
    },
    [filters, rubric, results, reactions, query, locked, runSearch],
  );

  if (phase === "search") {
    return (
      <SearchScreen
        onSubmit={start}
        busy={busy === "analyze"}
        error={analyzeError}
        onRetry={() => retry.current?.()}
      />
    );
  }

  if (!filters || !rubric) return null;

  if (phase === "frozen") {
    return (
      <FrozenView
        query={query}
        filters={filters}
        rubric={rubric}
        rounds={rounds}
        pool={results?.pool ?? null}
        results={results?.results ?? []}
        onReopen={() => setPhase("workspace")}
        onRestart={() => {
          setPhase("search");
          setResults(null);
          setMessages([]);
          setAnalyzeError(null);
        }}
      />
    );
  }

  const pending = {
    yes: Object.values(reactions).filter((v) => v === "yes").length,
    no: Object.values(reactions).filter((v) => v === "no").length,
  };

  return (
    <div className="xl:flex xl:h-screen xl:overflow-hidden">
      {/* ── Criteria, always visible ── */}
      <aside className="scroll-thin border-b border-ink bg-paper xl:w-[356px] xl:shrink-0 xl:overflow-y-auto xl:border-b-0 xl:border-r">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-ink bg-paper/92 px-4 py-3 backdrop-blur">
          <h2 className="micro text-ink">Search criteria</h2>
          {dirty ? (
            <button
              onClick={() => void runSearch(filters, rubric)}
              disabled={busy !== null}
              className="micro cursor-pointer bg-accent px-2.5 py-1.5 text-on-solid transition hover:bg-accent-ink disabled:cursor-not-allowed disabled:bg-rule disabled:text-ink-3"
            >
              {busy === "search" ? "Searching…" : "Re-run search"}
            </button>
          ) : (
            <span className="micro text-ink-3">Editable</span>
          )}
        </div>
        <div className="px-4 py-5">
          <CriteriaPanel
            filters={filters}
            rubric={rubric}
            pool={results?.pool ?? null}
            locked={locked}
            onFilters={(f, lock) => {
              setFilters(f);
              setLocked((prev) => new Set(prev).add(lock));
              setDirty(true);
            }}
            onRubric={(r) => {
              setRubric(r);
              setDirty(true);
            }}
          />
        </div>
      </aside>

      {/* ── Results ── */}
      <main className="scroll-thin xl:flex-1 xl:overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-ink bg-paper/92 px-7 py-3 backdrop-blur">
          <div className="min-w-0">
            <p className="display truncate text-[17px] leading-tight text-ink">&ldquo;{query}&rdquo;</p>
            <p className="mt-0.5 font-mono text-[10.5px] text-ink-3">
              {rounds === 0 ? "no refinements yet" : `${rounds} refinement ${rounds === 1 ? "round" : "rounds"}`}
              {results?.stats && results.stats.fromCache > 0 && (
                <> · {results.stats.fromCache} scores reused from cache</>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setPhase("frozen")}
              disabled={!results || busy !== null}
              className="micro inline-flex cursor-pointer items-center gap-1.5 border border-rule bg-panel px-3 py-2 text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-35"
            >
              <Icon.Freeze className="h-3 w-3" />
              Freeze
            </button>
          </div>
        </div>

        <div className="px-7 py-5">
          <ResultsPanel
            data={results}
            rubric={rubric}
            busy={busy === "search"}
            error={searchError}
            reactions={reactions}
            onRetry={() => retry.current?.()}
            onReact={(id, r) =>
              setReactions((prev) => {
                if (prev[id] === r) {
                  const { [id]: _cleared, ...rest } = prev;
                  return rest;
                }
                return { ...prev, [id]: r };
              })
            }
          />
        </div>
      </main>

      {/* ── Conversation ── */}
      <aside className="h-[540px] border-t border-ink bg-panel xl:h-full xl:w-[360px] xl:shrink-0 xl:border-l xl:border-t-0">
        <div className="border-b border-ink px-4 py-3">
          <h2 className="micro text-ink">Refine</h2>
          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
            Say what&rsquo;s wrong. Every change is shown with its reason.
          </p>
        </div>
        <div className="h-[calc(100%-62px)]">
          <ChatPanel
            messages={messages}
            busy={busy === "refine" || busy === "search"}
            busyLabel={busy === "refine" ? "Working out what to change" : "Re-running the search"}
            pending={pending}
            onClearPending={() => setReactions({})}
            onSend={sendFeedback}
            onFreeze={() => setPhase("frozen")}
            canFreeze={!!results}
            onRetry={() => retry.current?.()}
          />
        </div>
      </aside>
    </div>
  );
}
