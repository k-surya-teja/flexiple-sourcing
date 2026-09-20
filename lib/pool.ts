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

/** Fed to the analyze prompt so generated filters use real database values
    rather than plausible-looking synonyms that match nobody. */
export function vocabulary() {
  const profiles = allProfiles();
  const skills = [...new Set(profiles.flatMap((p) => p.skills))].sort();
  const locations = [...new Set(profiles.map((p) => p.location))].sort();
  return { skills, locations };
}
