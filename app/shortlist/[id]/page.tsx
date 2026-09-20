"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { FrozenView } from "@/components/FrozenView";
import { useSession } from "@/lib/session";

export default function ShortlistPage() {
  const router = useRouter();
  const id = String(useParams().id ?? "");
  const s = useSession();
  const rec = s.get(id);

  useEffect(() => {
    if (s.hydrated && !rec) router.replace("/");
  }, [s.hydrated, rec, router]);

  if (!s.hydrated || !rec?.filters || !rec.rubric) return null;

  return (
    <FrozenView
      query={rec.query}
      filters={rec.filters}
      rubric={rec.rubric}
      rounds={rec.rounds}
      pool={rec.results?.pool ?? null}
      results={rec.results?.results ?? []}
      onBack={() => router.push("/")}
      onReopen={() => s.reopen(id)}
      onRestart={() => router.push("/")}
    />
  );
}
