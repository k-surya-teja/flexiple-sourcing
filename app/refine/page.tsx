"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CriteriaPanel } from "@/components/CriteriaPanel";
import { ResultsPanel } from "@/components/ResultsPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Icon } from "@/components/Primitives";
import { useSession } from "@/lib/session";

export default function RefinePage() {
  const router = useRouter();
  const s = useSession();
  const [confirmNew, setConfirmNew] = useState(false);

  // Deep link or refresh with nothing to show: send them to the start.
  useEffect(() => {
    if (s.hydrated && !s.hasSession) router.replace("/");
  }, [s.hydrated, s.hasSession, router]);

  /* Reaching this route by any means — the back button included — means the
     search is live again, so the frozen flag must not linger and send a later
     "Resume" to the shortlist. */
  useEffect(() => {
    if (s.hydrated && s.hasSession && s.state.frozen) s.reopenInPlace();
  }, [s.hydrated, s.hasSession, s.state.frozen, s]);

  const { filters, rubric, results, messages, reactions, locked, rounds, query } = s.state;
  if (!s.hydrated || !filters || !rubric) return null;

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
          {s.dirty ? (
            <button
              onClick={() => void s.runSearch(filters, rubric)}
              disabled={s.busy !== null}
              className="micro cursor-pointer bg-accent px-2.5 py-1.5 text-on-solid transition hover:bg-accent-ink disabled:cursor-not-allowed disabled:bg-rule disabled:text-ink-3"
            >
              {s.busy === "search" ? "Searching…" : "Re-run search"}
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
            onFilters={s.setFilters}
            onRubric={s.setRubric}
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
            {/* Starting over throws away a search that cost real time and
                tokens, so it asks once rather than acting on a stray click. */}
            {confirmNew ? (
              <span className="flex items-center gap-1.5">
                <span className="micro text-ink-2">Discard this search?</span>
                <button
                  onClick={s.reset}
                  className="micro cursor-pointer bg-danger px-2.5 py-2 text-on-solid transition hover:opacity-90"
                >
                  Discard
                </button>
                <button
                  onClick={() => setConfirmNew(false)}
                  className="micro cursor-pointer border border-rule px-2.5 py-2 text-ink-2 transition hover:border-ink hover:text-ink"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmNew(true)}
                className="micro cursor-pointer border border-rule bg-panel px-3 py-2 text-ink-2 transition hover:border-ink hover:text-ink"
              >
                New search
              </button>
            )}
            <button
              onClick={s.freeze}
              disabled={!results || s.busy !== null}
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
            busy={s.busy === "search"}
            error={s.searchError}
            reactions={reactions}
            onRetry={s.retry}
            onReact={s.react}
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
            busy={s.busy === "refine" || s.busy === "search"}
            busyLabel={s.busy === "refine" ? "Working out what to change" : "Re-running the search"}
            pending={pending}
            onClearPending={s.clearReactions}
            onSend={s.sendFeedback}
            onFreeze={s.freeze}
            canFreeze={!!results}
            onRetry={s.retry}
          />
        </div>
      </aside>
    </div>
  );
}
