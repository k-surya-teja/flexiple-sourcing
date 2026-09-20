import fs from "node:fs";
import path from "node:path";
import { Profile } from "./schemas";
import { z } from "zod";

let cached: Profile[] | null = null;

/** The entire talent pool. In production this is the 98M-row store; here it is
    a file, which is exactly why filtering lives in code and not in the LLM. */
export function allProfiles(): Profile[] {
  if (!cached) {
    const raw = fs.readFileSync(path.join(process.cwd(), "data", "profiles.json"), "utf8");
    cached = z.array(Profile).parse(JSON.parse(raw));
  }
  return cached;
}

/** Size of the searchable pool. Read from the data rather than written into the
    UI as a literal: the brief supplies its own profiles.json, and a hardcoded
    count would quietly start lying the moment that file is swapped. */
export function poolSize(): number {
  return allProfiles().length;
}

/** Fed to the analyze prompt so generated filters use real database values
    rather than plausible-looking synonyms that match nobody. */
export function vocabulary() {
  const profiles = allProfiles();
  const skills = [...new Set(profiles.flatMap((p) => p.skills))].sort();
  const locations = [...new Set(profiles.map((p) => p.location))].sort();
  return { skills, locations };
}
