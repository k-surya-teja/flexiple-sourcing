/* Shared text matching. Deliberately conservative: a filter that matches too
   eagerly is worse than one that misses, because the recruiter can see a
   missing candidate but cannot see one that was wrongly included. */

const ALIASES: Record<string, string> = {
  postgres: "postgresql",
  psql: "postgresql",
  node: "node.js",
  nodejs: "node.js",
  k8s: "kubernetes",
  ts: "typescript",
  js: "javascript",
  bengaluru: "bangalore",
  blr: "bangalore",
  golang: "go",
};

export const norm = (s: string) => {
  const t = s.trim().toLowerCase();
  return ALIASES[t] ?? t;
};

const tokens = (s: string) => norm(s).split(/[^a-z0-9.+#]+/).filter(Boolean);

/** True if `needle`'s tokens appear as a contiguous run inside `haystack`'s.
    "RDS" matches "AWS RDS"; "SQL" does not match "PostgreSQL". */
function tokenRunMatch(needle: string, haystack: string): boolean {
  const n = tokens(needle);
  const h = tokens(haystack);
  if (!n.length || n.length > h.length) return false;
  for (let i = 0; i <= h.length - n.length; i++) {
    if (n.every((t, j) => h[i + j] === t)) return true;
  }
  return false;
}

export function skillMatches(required: string, skills: string[]): boolean {
  return skills.some((s) => norm(s) === norm(required) || tokenRunMatch(required, s));
}

export function locationMatches(required: string, location: string): boolean {
  return norm(location).includes(norm(required)) || tokenRunMatch(required, location);
}

export function titleMatches(keyword: string, title: string): boolean {
  return norm(title).includes(norm(keyword));
}
