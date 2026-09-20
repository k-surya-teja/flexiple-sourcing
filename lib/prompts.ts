import fs from "node:fs";
import path from "node:path";

/* Prompts live in /prompts as markdown so they can be read and edited without
   digging through TypeScript. Each file has a ## SYSTEM and a ## USER section;
   {{placeholders}} are filled at call time. Re-read on every call in dev so
   prompt edits take effect without a restart.                               */

type Template = { system: string; user: string };
const cache = new Map<string, Template>();

function parse(raw: string): Template {
  const sys = raw.indexOf("## SYSTEM");
  const usr = raw.indexOf("## USER");
  if (sys === -1 || usr === -1 || usr < sys) {
    throw new Error("Prompt file must contain a ## SYSTEM section followed by a ## USER section.");
  }
  return {
    system: raw.slice(sys + "## SYSTEM".length, usr).trim(),
    user: raw.slice(usr + "## USER".length).trim(),
  };
}

const fill = (s: string, vars: Record<string, string>) =>
  s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");

export function loadPrompt(name: string, vars: Record<string, string> = {}): Template {
  let tpl = cache.get(name);
  if (!tpl || process.env.NODE_ENV === "development") {
    tpl = parse(fs.readFileSync(path.join(process.cwd(), "prompts", `${name}.md`), "utf8"));
    cache.set(name, tpl);
  }
  return { system: fill(tpl.system, vars), user: fill(tpl.user, vars) };
}
