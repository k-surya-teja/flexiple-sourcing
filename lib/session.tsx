"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { analyze, refine, search, type LLMErrorShape, type SearchResponse } from "./client";
import type { Filters, Rubric } from "./schemas";
import type { LockKey } from "./ops";
import type { Message } from "@/components/ChatPanel";

/* One session, held in a provider mounted in the root layout.

   Why here and not in a page: App Router layouts do not remount across client
   navigation, so /, /refine and /shortlist can be real routes — real URLs, a
   working browser back button — while the search itself survives moving
   between them. A page-level store would be destroyed on every navigation.

   Why sessionStorage: a refresh used to discard a search that cost ten seconds
   and real tokens to produce. sessionStorage dies with the tab, so this is
   within-session recovery, not the cross-session persistence the brief rules
   out. Transient things — in-flight status, errors — are deliberately not
   persisted; a reload should never restore a spinner or a stale failure. */

const KEY = "flexiple.sourcing.session";

export type Phase = "search" | "refine" | "shortlist";
type Busy = null | "analyze" | "search" | "refine";

type Persisted = {
  query: string;
  filters: Filters | null;
  rubric: Rubric | null;
  results: SearchResponse | null;
  messages: Message[];
  locked: LockKey[];
  reactions: Record<string, "yes" | "no">;
  rounds: number;
  history: string[];
  frozen: boolean;
};

const EMPTY: Persisted = {
  query: "",
  filters: null,
  rubric: null,
  results: null,
  messages: [],
  locked: [],
  reactions: {},
  rounds: 0,
  history: [],
  frozen: false,
};

type SessionValue = {
  hydrated: boolean;
  hasSession: boolean;
  state: Persisted;
  busy: Busy;
  analyzeError: LLMErrorShape | null;
  searchError: LLMErrorShape | null;
  dirty: boolean;
  start: (query: string) => Promise<void>;
  runSearch: (f: Filters, r: Rubric) => Promise<void>;
  sendFeedback: (text: string) => Promise<void>;
  setFilters: (f: Filters, lock: LockKey) => void;
  setRubric: (r: Rubric) => void;
  react: (id: string, r: "yes" | "no") => void;
  clearReactions: () => void;
  freeze: () => void;
  reopen: () => void;
  /** Clears the frozen flag without navigating — for landing on /refine directly. */
  reopenInPlace: () => void;
  reset: () => void;
  retry: () => void;
};

const Ctx = createContext<SessionValue | null>(null);

export const useSession = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession must be used inside <SessionProvider>");
  return v;
};

const uid = () => Math.random().toString(36).slice(2, 9);
type Draft<T> = T extends unknown ? Omit<T, "id"> : never;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<Persisted>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [analyzeError, setAnalyzeError] = useState<LLMErrorShape | null>(null);
  const [searchError, setSearchError] = useState<LLMErrorShape | null>(null);
  const [dirty, setDirty] = useState(false);

  const retryRef = useRef<(() => void) | null>(null);
  /* Only the newest search may write results: rounds range from ~200ms on a
     full cache hit to ~30s waiting out a rate limit, so a slow early request
     can otherwise land last and overwrite criteria already moved on from. */
  const searchSeq = useRef(0);

  // Restore on first mount, so a refresh does not throw the search away.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setState({ ...EMPTY, ...(JSON.parse(raw) as Persisted) });
    } catch {
      /* corrupt or unavailable — start clean rather than crash */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (state.filters) sessionStorage.setItem(KEY, JSON.stringify(state));
      else sessionStorage.removeItem(KEY);
    } catch {
      /* quota or private mode — the session simply will not survive a reload */
    }
  }, [state, hydrated]);

  const patch = (p: Partial<Persisted>) => setState((s) => ({ ...s, ...p }));
  const say = (m: Draft<Message>) =>
    setState((s) => ({ ...s, messages: [...s.messages, { ...m, id: uid() } as Message] }));

  const runSearch = useCallback(async (f: Filters, r: Rubric) => {
    const seq = ++searchSeq.current;
    setBusy("search");
    setSearchError(null);
    setDirty(false);

    const res = await search(f, r);
    if (seq !== searchSeq.current) return; // superseded

    setBusy(null);
    if (!res.ok) {
      setSearchError(res.error);
      retryRef.current = () => void runSearch(f, r);
      return;
    }
    patch({ results: res.data });
  }, []);

  const start = useCallback(
    async (query: string) => {
      setBusy("analyze");
      setAnalyzeError(null);

      const res = await analyze(query);
      if (!res.ok) {
        setBusy(null);
        setAnalyzeError(res.error);
        retryRef.current = () => void start(query);
        return;
      }

      const { filters, rubric, interpretation, preview } = res.data;
      setState({
        ...EMPTY,
        query,
        filters,
        rubric,
        messages: [
          { id: uid(), role: "assistant", kind: "note", text: interpretation },
          {
            id: uid(),
            role: "assistant",
            kind: "note",
            text: `${preview.matched} of ${preview.totalPool} profiles clear these filters. Scoring them against the rubric now — tell me what's wrong with the results and I'll adjust.`,
          },
        ],
      });
      router.push("/refine");
      await runSearch(filters, rubric);
    },
    [router, runSearch],
  );

  const sendFeedback = useCallback(
    async (text: string) => {
      const { filters, rubric, results, reactions, locked, history, query } = state;
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
        locked,
        history,
      });

      setBusy(null);
      if (!res.ok) {
        say({ role: "assistant", kind: "error", error: res.error });
        retryRef.current = () => void sendFeedback(text);
        return;
      }

      setState((s) => ({
        ...s,
        filters: res.data.filters,
        rubric: res.data.rubric,
        reactions: {},
        rounds: s.rounds + 1,
        history: [...s.history, text],
        messages: [
          ...s.messages,
          { id: uid(), role: "assistant", kind: "diff", text: res.data.interpretation, applied: res.data.applied },
        ],
      }));

      await runSearch(res.data.filters, res.data.rubric);
    },
    [state, runSearch],
  );

  const value: SessionValue = {
    hydrated,
    hasSession: !!state.filters && !!state.rubric,
    state,
    busy,
    analyzeError,
    searchError,
    dirty,
    start,
    runSearch,
    sendFeedback,
    setFilters: (f, lock) => {
      setState((s) => ({ ...s, filters: f, locked: s.locked.includes(lock) ? s.locked : [...s.locked, lock] }));
      setDirty(true);
    },
    setRubric: (r) => {
      patch({ rubric: r });
      setDirty(true);
    },
    react: (id, r) =>
      setState((s) => {
        if (s.reactions[id] === r) {
          const { [id]: _cleared, ...rest } = s.reactions;
          return { ...s, reactions: rest };
        }
        return { ...s, reactions: { ...s.reactions, [id]: r } };
      }),
    clearReactions: () => patch({ reactions: {} }),
    freeze: () => {
      patch({ frozen: true });
      router.push("/shortlist");
    },
    reopen: () => {
      patch({ frozen: false });
      router.push("/refine");
    },
    reopenInPlace: () => patch({ frozen: false }),
    reset: () => {
      searchSeq.current++; // abandon anything in flight
      setState(EMPTY);
      setBusy(null);
      setAnalyzeError(null);
      setSearchError(null);
      setDirty(false);
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* ignore */
      }
      router.push("/");
    },
    retry: () => retryRef.current?.(),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
