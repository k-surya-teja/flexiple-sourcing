"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { analyze, refine, search, type LLMErrorShape, type SearchResponse } from "./client";
import type { Filters, Rubric } from "./schemas";
import type { LockKey } from "./ops";
import type { Message } from "@/components/ChatPanel";

/* A session holds every search the recruiter has run, not just the latest.

   Sourcing is comparative work — you try "RDS developers in Bangalore", then
   "senior frontend", then want the first one back. Previously starting a second
   search destroyed the first, along with the tokens and the refinement rounds
   that went into it. Each search now keeps its own filters, rubric, results,
   conversation and locked fields, and carries its own id in the URL.

   Mounted in the root layout: App Router layouts do not remount across client
   navigation, so searches survive moving between routes. Mirrored to
   sessionStorage, which dies with the tab — within-session recovery, not the
   cross-session persistence the brief rules out. In-flight status and errors
   are deliberately not persisted; a reload must never restore a spinner or a
   stale failure. */

const KEY = "flexiple.sourcing.session";
const MAX_SEARCHES = 12;

type Busy = null | "analyze" | "search" | "refine";

export type SearchRecord = {
  id: string;
  query: string;
  createdAt: number;
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

type SessionValue = {
  hydrated: boolean;
  searches: SearchRecord[];
  get: (id: string) => SearchRecord | undefined;
  busy: Busy;
  /** Which search the in-flight work belongs to. */
  busyFor: string | null;
  analyzeError: LLMErrorShape | null;
  errorFor: (id: string) => LLMErrorShape | null;
  dirty: (id: string) => boolean;
  start: (query: string) => Promise<void>;
  runSearch: (id: string, f: Filters, r: Rubric) => Promise<void>;
  sendFeedback: (id: string, text: string) => Promise<void>;
  setFilters: (id: string, f: Filters, lock: LockKey) => void;
  setRubric: (id: string, r: Rubric) => void;
  react: (id: string, profileId: string, r: "yes" | "no") => void;
  clearReactions: (id: string) => void;
  freeze: (id: string) => void;
  reopen: (id: string) => void;
  unfreezeInPlace: (id: string) => void;
  remove: (id: string) => void;
  clearAll: () => void;
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
  const [searches, setSearches] = useState<SearchRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [busyFor, setBusyFor] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<LLMErrorShape | null>(null);
  const [searchErrors, setSearchErrors] = useState<Record<string, LLMErrorShape>>({});
  const [dirtyIds, setDirtyIds] = useState<Record<string, boolean>>({});

  const retryRef = useRef<(() => void) | null>(null);
  /* Per-search request ids. Rounds range from ~200ms on a full cache hit to
     ~30s waiting out a rate limit, so a slow early request can otherwise land
     last and overwrite criteria already moved on from. */
  const seqs = useRef<Record<string, number>>({});

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SearchRecord[];
        if (Array.isArray(parsed)) setSearches(parsed);
      }
    } catch {
      /* corrupt or unavailable — start clean rather than crash */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (searches.length) sessionStorage.setItem(KEY, JSON.stringify(searches));
      else sessionStorage.removeItem(KEY);
    } catch {
      /* quota or private mode — the session simply will not survive a reload */
    }
  }, [searches, hydrated]);

  const update = useCallback(
    (id: string, fn: (s: SearchRecord) => SearchRecord) =>
      setSearches((all) => all.map((s) => (s.id === id ? fn(s) : s))),
    [],
  );

  const say = useCallback(
    (id: string, m: Draft<Message>) =>
      update(id, (s) => ({ ...s, messages: [...s.messages, { ...m, id: uid() } as Message] })),
    [update],
  );

  const runSearch = useCallback(
    async (id: string, f: Filters, r: Rubric) => {
      const seq = (seqs.current[id] = (seqs.current[id] ?? 0) + 1);
      setBusy("search");
      setBusyFor(id);
      setSearchErrors((e) => {
        const { [id]: _gone, ...rest } = e;
        return rest;
      });
      setDirtyIds((d) => ({ ...d, [id]: false }));

      const res = await search(f, r);
      if (seq !== seqs.current[id]) return; // superseded

      setBusy(null);
      setBusyFor(null);
      if (!res.ok) {
        setSearchErrors((e) => ({ ...e, [id]: res.error }));
        retryRef.current = () => void runSearch(id, f, r);
        return;
      }
      update(id, (s) => ({ ...s, results: res.data }));
    },
    [update],
  );

  const start = useCallback(
    async (query: string) => {
      setBusy("analyze");
      setBusyFor(null);
      setAnalyzeError(null);

      const res = await analyze(query);
      if (!res.ok) {
        setBusy(null);
        setAnalyzeError(res.error);
        retryRef.current = () => void start(query);
        return;
      }

      const { filters, rubric, interpretation, preview } = res.data;
      const id = uid();
      const record: SearchRecord = {
        id,
        query,
        createdAt: Date.now(),
        filters,
        rubric,
        results: null,
        messages: [
          { id: uid(), role: "assistant", kind: "note", text: interpretation },
          {
            id: uid(),
            role: "assistant",
            kind: "note",
            text: `${preview.matched} of ${preview.totalPool} profiles clear these filters. Scoring them against the rubric now — tell me what's wrong with the results and I'll adjust.`,
          },
        ],
        locked: [],
        reactions: {},
        rounds: 0,
        history: [],
        frozen: false,
      };

      // Newest first, and bounded so a long session cannot exhaust storage.
      setSearches((all) => [record, ...all].slice(0, MAX_SEARCHES));
      router.push(`/refine/${id}`);
      await runSearch(id, filters, rubric);
    },
    [router, runSearch],
  );

  const sendFeedback = useCallback(
    async (id: string, text: string) => {
      const rec = searches.find((s) => s.id === id);
      if (!rec?.filters || !rec.rubric || !rec.results) return;

      say(id, { role: "recruiter", text });
      setBusy("refine");
      setBusyFor(id);

      const liked = Object.entries(rec.reactions).filter(([, v]) => v === "yes").map(([k]) => k);
      const disliked = Object.entries(rec.reactions).filter(([, v]) => v === "no").map(([k]) => k);

      const res = await refine({
        query: rec.query,
        filters: rec.filters,
        rubric: rec.rubric,
        shown: rec.results.results.slice(0, 5).map((r) => ({
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
        locked: rec.locked,
        history: rec.history,
      });

      setBusy(null);
      setBusyFor(null);
      if (!res.ok) {
        say(id, { role: "assistant", kind: "error", error: res.error });
        retryRef.current = () => void sendFeedback(id, text);
        return;
      }

      update(id, (s) => ({
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

      await runSearch(id, res.data.filters, res.data.rubric);
    },
    [searches, say, update, runSearch],
  );

  const value: SessionValue = {
    hydrated,
    searches,
    get: (id) => searches.find((s) => s.id === id),
    busy,
    busyFor,
    analyzeError,
    errorFor: (id) => searchErrors[id] ?? null,
    dirty: (id) => !!dirtyIds[id],
    start,
    runSearch,
    sendFeedback,
    setFilters: (id, f, lock) => {
      update(id, (s) => ({
        ...s,
        filters: f,
        locked: s.locked.includes(lock) ? s.locked : [...s.locked, lock],
      }));
      setDirtyIds((d) => ({ ...d, [id]: true }));
    },
    setRubric: (id, r) => {
      update(id, (s) => ({ ...s, rubric: r }));
      setDirtyIds((d) => ({ ...d, [id]: true }));
    },
    react: (id, profileId, r) =>
      update(id, (s) => {
        if (s.reactions[profileId] === r) {
          const { [profileId]: _cleared, ...rest } = s.reactions;
          return { ...s, reactions: rest };
        }
        return { ...s, reactions: { ...s.reactions, [profileId]: r } };
      }),
    clearReactions: (id) => update(id, (s) => ({ ...s, reactions: {} })),
    freeze: (id) => {
      update(id, (s) => ({ ...s, frozen: true }));
      router.push(`/shortlist/${id}`);
    },
    reopen: (id) => {
      update(id, (s) => ({ ...s, frozen: false }));
      router.push(`/refine/${id}`);
    },
    unfreezeInPlace: (id) => update(id, (s) => ({ ...s, frozen: false })),
    remove: (id) => {
      seqs.current[id] = (seqs.current[id] ?? 0) + 1; // abandon anything in flight
      setSearches((all) => all.filter((s) => s.id !== id));
    },
    clearAll: () => {
      setSearches([]);
      setBusy(null);
      setBusyFor(null);
      setAnalyzeError(null);
      setSearchErrors({});
      setDirtyIds({});
    },
    retry: () => retryRef.current?.(),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
