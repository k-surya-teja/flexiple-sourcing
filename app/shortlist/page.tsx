"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FrozenView } from "@/components/FrozenView";
import { useSession } from "@/lib/session";

export default function ShortlistPage() {
  const router = useRouter();
  const s = useSession();

  useEffect(() => {
    if (s.hydrated && !s.hasSession) router.replace("/");
  }, [s.hydrated, s.hasSession, router]);

  const { filters, rubric, results, rounds, query } = s.state;
  if (!s.hydrated || !filters || !rubric) return null;

  return (
    <FrozenView
      query={query}
      filters={filters}
      rubric={rubric}
      rounds={rounds}
      pool={results?.pool ?? null}
      results={results?.results ?? []}
      onReopen={s.reopen}
      onRestart={s.reset}
    />
  );
}
