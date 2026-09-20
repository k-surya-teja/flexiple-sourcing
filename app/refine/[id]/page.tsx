"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { CriteriaPanel } from "@/components/CriteriaPanel";
import { ResultsPanel } from "@/components/ResultsPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Icon } from "@/components/Primitives";
import { useSession } from "@/lib/session";

export default function RefinePage() {
  const router = useRouter();
  const id = String(useParams().id ?? "");
  const s = useSession();
  const rec = s.get(id);

  // Deep link or refresh for a search this session does not have.
  useEffect(() => {
    if (s.hydrated && !rec) router.replace("/");
  }, [s.hydrated, rec, router]);

  /* Reaching this route by any means — the back button included — means the
     search is live again, so the frozen flag must not linger. */
  useEffect(() => {
    if (rec?.frozen) s.unfreezeInPlace(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec?.frozen, id]);

  if (!s.hydrated || !rec?.filters || !rec.rubric) return null;

  const { filters, rubric, results, messages, reactions, locked, rounds, query } = rec;
  const working = s.busyFor === id ? s.busy : null;
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
          {s.dirty(id) ? (
            <button
              onClick={() => void s.runSearch(id, filters, rubric)}
              disabled={working !== null}
              className="micro cursor-pointer bg-accent px-2.5 py-1.5 text-on-solid transition hover:bg-accent-ink disabled:cursor-not-allowed disabled:bg-rule disabled:text-ink-3"
            >
              {working === "search" ? "Searching…" : "Re-run search"}
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
            locked={new Set(locked)}
            onFilters={(f, lock) => s.setFilters(id, f, lock)}
            onRubric={(r) => s.setRubric(id, r)}
          />
        </div>
      </aside>

      {/* ── Results ── */}
      <main className="scroll-thin xl:flex-1 xl:overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-ink bg-paper/92 px-7 py-3 backdrop-blur">
          {/* Non-destructive: the search stays in the session and is listed on
              the entry screen. Pushes rather than history.back() so it behaves
              the same when this route was reached by a deep link. */}
          <button
            onClick={() => router.push("/")}
            title="Back to all searches — this one is kept"
            aria-label="Back to all searches"
            className="group/back -ml-1.5 shrink-0 cursor-pointer border border-transparent p-2 text-ink-3 transition hover:border-rule hover:bg-panel hover:text-ink"
          >
            <Icon.ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover/back:-translate-x-0.5" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="display truncate text-[17px] leading-tight text-ink">&ldquo;{query}&rdquo;</p>
            <p className="mt-0.5 font-mono text-[10.5px] text-ink-3">
              {rounds === 0 ? "no refinements yet" : `${rounds} refinement ${rounds === 1 ? "round" : "rounds"}`}
              {results?.stats && results.stats.fromCache > 0 && (
                <> · {results.stats.fromCache} scores reused from cache</>
              )}
              {s.searches.length > 1 && <> · {s.searches.length} searches this session</>}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => router.push("/")}
              className="micro cursor-pointer border border-rule bg-panel px-3 py-2 text-ink-2 transition hover:border-ink hover:text-ink"
            >
              New search
            </button>
            <button
              onClick={() => s.freeze(id)}
              disabled={!results || working !== null}
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
            busy={working === "search"}
            error={s.errorFor(id)}
            reactions={reactions}
            onRetry={s.retry}
            onReact={(profileId, r) => s.react(id, profileId, r)}
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
            busy={working === "refine" || working === "search"}
            busyLabel={working === "refine" ? "Working out what to change" : "Re-running the search"}
            pending={pending}
            onClearPending={() => s.clearReactions(id)}
            onSend={(text) => s.sendFeedback(id, text)}
            onFreeze={() => s.freeze(id)}
            canFreeze={!!results}
            onRetry={s.retry}
          />
        </div>
      </aside>
    </div>
  );
}
