"use client";

import { useRouter } from "next/navigation";
import { SearchScreen } from "@/components/SearchScreen";
import { useSession } from "@/lib/session";

export default function EntryPage() {
  const router = useRouter();
  const s = useSession();

  /* No automatic redirect when searches exist. Back from a workspace lands
     here, and bouncing forward again would break the back button and leave no
     way to start a different search. The session list is offered instead. */
  return (
    <SearchScreen
      onSubmit={s.start}
      busy={s.busy === "analyze"}
      error={s.analyzeError}
      onRetry={s.retry}
      sessions={
        s.hydrated && s.searches.length
          ? {
              items: s.searches.map((r) => ({
                id: r.id,
                query: r.query,
                rounds: r.rounds,
                ranked: r.results?.results.length ?? 0,
                matched: r.results?.pool.matched ?? 0,
                frozen: r.frozen,
                working: s.busyFor === r.id,
              })),
              onOpen: (id) => {
                const r = s.get(id);
                router.push(r?.frozen ? `/shortlist/${id}` : `/refine/${id}`);
              },
              onRemove: s.remove,
              onClearAll: s.clearAll,
            }
          : undefined
      }
    />
  );
}
