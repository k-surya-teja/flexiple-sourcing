"use client";

import { useRouter } from "next/navigation";
import { SearchScreen } from "@/components/SearchScreen";
import { useSession } from "@/lib/session";

export default function EntryPage() {
  const router = useRouter();
  const { hydrated, hasSession, state, busy, analyzeError, start, retry, reset } = useSession();

  /* No automatic redirect when a session exists. Back from /refine lands here,
     and bouncing the recruiter straight forward again would break the back
     button and leave no way to start a different search. They are offered the
     choice instead. */
  return (
    <SearchScreen
      onSubmit={start}
      busy={busy === "analyze"}
      error={analyzeError}
      onRetry={retry}
      resume={
        hydrated && hasSession && busy === null
          ? {
              query: state.query,
              rounds: state.rounds,
              onResume: () => router.push(state.frozen ? "/shortlist" : "/refine"),
              onDiscard: reset,
            }
          : undefined
      }
    />
  );
}
