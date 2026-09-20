import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Profile } from "./schemas";
import { z } from "zod";

let cached: Profile[] | null = null;

/* The supplied profiles.json carries no contact details, and it is kept exactly
   as given so a reviewer diffing it against their own copy sees no changes.
   Contact details are therefore synthesised here, at load, for display only.

   They are built so they cannot reach a real person: example.com is reserved by
   RFC 2606 and can never route mail, and each LinkedIn slug carries a
   deterministic suffix because a bare "linkedin.com/in/ananya-rao" is very
   plausibly some real stranger's vanity URL. A dataset that already has these
   fields keeps its own values. */
function withContact(p: Profile): Profile {
  if (p.email && p.linkedin) return p;
  const slug = p.name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
  const suffix = crypto.createHash("sha1").update(p.id).digest("hex").slice(0, 6);
  return {
    ...p,
    email: p.email ?? `${slug.replace(/-/g, ".")}@example.com`,
    linkedin: p.linkedin ?? `linkedin.com/in/${slug}-${suffix}`,
  };
}

/** The entire talent pool. In production this is the 98M-row store; here it is
    a file, which is exactly why filtering lives in code and not in the LLM. */
export function allProfiles(): Profile[] {
  if (!cached) {
    const raw = fs.readFileSync(path.join(process.cwd(), "data", "profiles.json"), "utf8");
    cached = z.array(Profile).parse(JSON.parse(raw)).map(withContact);
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
