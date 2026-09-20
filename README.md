# Sourcing — the refinement loop

A recruiter describes a role in plain English. The app turns that into objective
filters and a subjective fit rubric, applies the filters to a 48-profile talent
pool, scores the survivors with an LLM, and then lets the recruiter argue with
the results until they are right — showing exactly what changed and why after
every round.

---

## Running it

```bash
npm install
echo "GROQ_API_KEY=your_key_here" > .env.local
npm run dev
```

Open http://localhost:3000.

**Environment variable: `GROQ_API_KEY`.** A free key takes about a minute at
[console.groq.com/keys](https://console.groq.com/keys). Optionally set
`GROQ_MODEL` to override the default (`openai/gpt-oss-120b`); the app falls back
to `openai/gpt-oss-20b` then `qwen/qwen3.8-27b` if a model is unavailable.

Set `LLM_DEBUG=1` to log every model call with its latency and token usage — how
the rate-limit behaviour below was diagnosed.

Without a key the app still runs and shows a designed "no API key configured"
state rather than crashing.

---

## How it works

```
BROWSER (owns session state)                SERVER (stateless + score cache)
────────────────────────────                ────────────────────────────────
  free text
      │
      ├─ POST /api/analyze ───────────────► LLM #1  text → filters + rubric
      │  ◄── filters, rubric, match count    then applyFilters() for a free preview
      │
  criteria render immediately, editable
      │
      ├─ POST /api/search ────────────────► filter.ts   48 → ~12   (no LLM)
      │  ◄── ranked results                  LLM #2  batch-score the survivors
      │                                      evidence guard drops unverifiable claims
  top 5 with per-profile Match / Not a match
      │
  "1 is too junior, 2 and 4 are right"
      │
      ├─ POST /api/refine ────────────────► LLM #3  feedback → PATCH OPERATIONS
      │  ◄── ops + filters + rubric          applyOps() applies them deterministically
      │         └─► POST /api/search again (cache hits on unchanged profiles)
      │
  Freeze ──► final filters, final rubric, final ranked list
```

### The five decisions that shaped this

**0. Relevance ordering before truncation.**
Only 15 profiles can be scored per round (see the token budget section). Taking
the first 15 in dataset order turns out to be quietly catastrophic when the
filters are loose: "senior frontend engineers who have owned a design system"
generates no hard skill filter — correctly, since that is a judgement, not a
constraint — so 38 profiles survive, and the first 15 happen to be backend
engineers. Before the fix, that search returned a confidently ranked list of
backend engineers scoring 15/100 and never scored a single frontend candidate.
`lib/prerank.ts` now orders survivors by a cheap lexical match against the
rubric the LLM just wrote, then truncates. Same query, after: Staff Frontend
Engineer at 78, Senior Frontend Engineer at 75. It is pure code, costs nothing,
and never judges quality — it only decides who is worth spending a scoring token
on. The LLM still does all the judging.

**1. Filters are code. Scoring is the LLM. They never mix.**
`lib/filter.ts` is a pure function — no network, instant, deterministic. The LLM
*writes* filters but never *applies* them. This is also the honest shape for 98M
profiles, where the filter step becomes a database query and the model only ever
sees what survives. It also means the empty state costs zero tokens.

**2. Refinement returns a diff, not a regenerated rubric.**
`/api/refine` returns a closed set of typed operations (`set_years`,
`reweight_criterion`, `add_criterion`, …), each carrying its own `reason`.
`lib/ops.ts` applies them. Three things fall out for free:

- the "here is what I changed and why" panel is a render of the returned log, with
  no second LLM call to explain itself;
- a filter the recruiter edited by hand **cannot be silently overwritten** — edited
  fields are locked, and an operation targeting one is skipped and reported;
- a reviewer can audit exactly what a piece of feedback did to the search.

**3. Every claim cites a field, and the citation is verified.**
The scoring schema forces each assessment to name the profile field it came from
(`{"field": "skills", "value": "AWS RDS"}`). `lib/evidence.ts` then checks the
value actually appears in that field of that profile, and **drops any claim that
fails** before it reaches the screen. The cited field and value are shown under
each card, and dropped claims are counted openly. Prompt wording alone never
makes a model honest; an unverifiable claim simply not rendering does.

**4. Batched scoring with a rubric-keyed cache.**
One request per 8 profiles at concurrency 2, not 48 separate calls — which would
be slow and would trip the free tier instantly. Scores are cached on
`sha1(rubric) + profileId`, so a refinement that only tightens a *filter* re-uses
every score it already has and returns in milliseconds. The header shows how many
scores were reused. This is most of why refinement feels like a conversation
rather than a new search.

**5. The client owns session state; the server is stateless.**
Filters, rubric, message history and feedback live in the browser and are posted
with each request. The server keeps only its score cache, which is a pure
optimisation and safe to lose. A server-side session map would have been wiped by
Next's dev hot-reload on every file save — a steady source of ghost bugs, for no
benefit the brief asks for, since there is no persistence across sessions anyway.

### Failure handling

Every LLM call goes through one wrapper, `callLLM` in `lib/llm.ts`, which owns:

| Failure | Handling |
|---|---|
| No API key | Typed `missing_key`, surfaced as a setup instruction |
| Rate limit (429) | Respects `Retry-After`, exponential backoff + jitter, 2 retries, then a countdown button |
| Timeout | 30s abort, typed `timeout`, retry offered |
| 5xx / model decommissioned | One retry, then falls back to a secondary model |
| Malformed JSON | Fence stripping, trailing-comma repair, then **one corrective round trip with the Zod error fed back to the model** |
| Schema mismatch after repair | Typed `malformed`; nothing is applied, and the raw response is viewable in the card |
| One scoring batch fails | The round still returns. Affected profiles are listed as unscored and the UI says so |
| Whole run overruns | A 60s scoring budget and a 70s per-call deadline; past those, partial results are returned rather than a hanging spinner |
| Overlapping searches | A monotonic request id; only the newest search may write state, so a slow early round cannot overwrite a fast later one |
| Long sessions | Refinement history is trimmed to a token budget, and the prompt is told how many earlier rounds were omitted and where their effect already lives |

Route handlers only ever branch on a typed error. Each of the six kinds has its
own title, explanation and next step in the UI — there is no generic toast.

### Working inside an 8k token-per-minute budget

A new Groq key allows **8,000 tokens per minute**, which turned out to be the
binding constraint on this whole design, and a genuinely instructive one.

Three things came out of measuring it rather than guessing (`LLM_DEBUG=1`):

- **`max_tokens` is a reservation, not a ceiling to be generous with.** An early
  version asked for 12,000 output tokens per scoring call — more than the entire
  minute's budget — so every call 429'd, and the retry-then-fall-back-to-another-model
  chain turned one search into a 17-minute hang. Budgets are now sized to the
  work (2,600 for a scoring batch) and there is a hard deadline so no round can
  ever run away like that again.
- **Batch size is a token trade, not a latency one.** The system prompt is resent
  with every batch, so *larger* batches spend fewer total tokens; completion
  tokens scale with profile count either way. Scoring runs one batch of six at a
  time, sequentially — two parallel calls at ~4k tokens each blow the minute's
  budget in one go.
- **A rate limit is account-wide, so falling back to another model is pure
  waste.** Only `upstream` and `truncated` failures walk the model chain; a 429
  waits out its `Retry-After` instead.

Together these took a cold search from 32s to **under 7s**. When the limit is hit
anyway on a wide search, the UI says so in plain language after a few seconds
rather than spinning silently.

### Prompts

All three prompts are in [`prompts/`](./prompts) as readable markdown, each with a
`## SYSTEM` and `## USER` section. They are re-read on every call in development,
so they can be edited without restarting.

- [`analyze.md`](./prompts/analyze.md) — free text → filters + rubric. Grounded in
  the dataset's **actual skill and location vocabulary**, injected at call time, so
  generated filters match real values instead of plausible synonyms. A filter
  saying `Postgres` when the data says `PostgreSQL` matches nobody.
- [`score.md`](./prompts/score.md) — batch scoring, with the evidence rules and an
  explicit ban on generic praise.
- [`refine.md`](./prompts/refine.md) — feedback → operations. Contains the
  judgement call the model is actually there to make: when feedback is a hard
  boundary (a filter) versus a matter of taste (the rubric). It is told to prefer
  the rubric, because filters delete people permanently and invisibly, and to test
  any proposed filter change against the profiles the recruiter just approved.

---

## What I prioritised, and what I cut

**Time box: 3 hours.** Roughly 55 minutes on the engine, 50 on the interface,
the rest on the dataset, verification and this document.

### The interface

The visual direction is deliberately not SaaS-dashboard. Sourcing is reading
about people, so the interface borrows from print archives: warm paper rather
than cool grey, a display serif on candidate names, monospace for anything
measured, hairline rules instead of boxed cards, square corners, and a single
saturated accent. A candidate entry is laid out as a dossier row with the rank
set as a numeral in the margin — the intent is something a recruiter reviews,
not something they administer.

Two details that are function rather than decoration:

- **The `cited` line under every explanation** shows the actual profile field and
  value each claim came from. It is the verification result made visible.
- **Negative-polarity criteria only appear when they are triggered.** A criterion
  the search is trying to *avoid*, when not met, is the good outcome; rendering
  it as a grey ✗ alongside genuine misses read as failure, so absence of the flag
  is left unsaid.

**Dark mode** is a full second palette rather than an inversion: the ground stays
warm (`#14120e`, not a neutral charcoal) so the paper character survives, and the
accent lightens to `#e2703f` so it still reads against a dark field. Because the
accent lightens, white text on a solid fill would fail contrast there — so every
solid brand fill takes its text from one `--color-on-solid` token that flips with
the theme.

The toggle has three states, not two: most people never touch it and should
follow the OS, so *system* has to be a real, returnable state rather than an
implicit starting position. Only an explicit choice writes `data-theme`; the
system case is handled by the media query alone. A small inline script applies a
stored choice before first paint, so an explicit dark preference never flashes
light.

All twelve foreground/background pairs were checked in **both** palettes and pass
WCAG AA at 4.5:1 for normal text. Three light-mode tones had to be darkened to
get there.

### Prioritised

- **The refinement loop responding visibly and traceably.** This is the thing the
  brief says makes the product useful, so the diff-based architecture got the
  design time even though a "regenerate the rubric" approach would have been
  faster to write.
- **Trustworthy explanations.** Verified citations are the difference between a
  recruiter believing the ranking and ignoring it.
- **Designed failure states.** Six typed errors, each with its own copy and its own
  recovery. A rate limit on a free tier is not an edge case, it is Tuesday.
- **The empty state.** It names the filter clause doing the most damage, using
  counts that come free from the pure filter pass.

### Cut, deliberately

- **Streaming / token-by-token output.** The two-step `analyze` → `search` split
  already removes the worst of the wait: criteria render in about a second while
  scoring runs behind them. Streaming would have added real complexity for a
  second-order gain.
- **Tests.** With the clock running I chose verification by exercising the real
  paths over a suite I could not finish. The pure modules (`filter`, `match`,
  `evidence`, `ops`) are written as plain functions specifically so tests can be
  added without touching anything else — that is where I would start with another
  hour.
- **Persistence, auth, multiple roles.** Explicitly out of scope per the brief.
- **Scoring the whole pool on a wide search.** Capped at 24 profiles per round to
  keep a round under ~10 seconds. The cap is surfaced in the UI with the number of
  additional matches, rather than hidden.

### Known limits

- **There is no undo.** The product is iterative by design, but a recruiter who
  says something that makes the results worse has to talk their way back out
  rather than step back. The architecture makes this cheap to add — refinement
  already returns a diff and all state is client-side, so a stack of
  `{filters, rubric}` snapshots plus the rubric-keyed score cache would make an
  "undo last round" near-instant. It is the first thing I would build next.
- **A recruiter cannot add a rubric criterion by hand** — only delete, reweight
  and edit descriptions. Asymmetric, and reachable in normal use.
- **Dark mode was originally cut and added afterwards**, outside the 3-hour box,
  at the reviewer's request. It is noted here rather than folded into the build
  time.
- **A profile the recruiter explicitly approved can still slip down the ranking.**
  In testing, adding two weight-5 criteria on top of five existing ones compressed
  the score range and moved an approved profile from #3 to #6. Scores are produced
  per batch without sight of the whole pool, so they are calibrated loosely.
  Pinning approved profiles, or asking the refinement step to cap the number of
  weight-5 criteria, would be the first fix with more time.

- Below 1280px the three columns stack into one. It is usable, but this is a
  desktop tool and the desktop layout is the one that got the attention.
- Skill matching is token-based with a small alias table (`postgres` →
  `postgresql`, `k8s` → `kubernetes`). It is deliberately conservative: a filter
  that over-matches is worse than one that under-matches, because a recruiter can
  see a candidate who is missing but not one who was wrongly included.
- `MAX_SCORED = 15`, `BATCH_SIZE = 6` and the token budgets are tuned for Groq's
  free tier, not for throughput. On a paid key, raising concurrency is the single
  biggest available speedup.

---

## Layout

```
app/
  page.tsx              phase machine + all session state
  api/analyze/route.ts  LLM #1
  api/search/route.ts   pure filter + LLM #2
  api/refine/route.ts   LLM #3 + deterministic patch application
components/             SearchScreen · CriteriaPanel · ResultsPanel · ProfileCard
                        ChatPanel · FrozenView · Primitives
lib/
  schemas.ts            Zod contracts — the real interface of the app
  llm.ts                the only place that talks to Groq
  filter.ts  match.ts   pure, deterministic filtering
  evidence.ts           claim verification
  ops.ts                patch application + field locking
  score.ts              batching, caching, partial-failure tolerance
  prompts.ts            loads prompts/*.md
prompts/                analyze.md · score.md · refine.md
data/profiles.json      the 48-profile talent pool
```

## Data

`data/profiles.json` holds 48 fictional profiles in the schema given in the
brief, mixing obvious matches, near misses on a single axis (right skills wrong
city, right everything but nine years, right profile but scaleup rather than
startup, strong Bangalore startup backend engineer who has only ever used
MongoDB) and clear non-matches, so the refinement loop has something to bite on.
Replacing this file with a different one in the same schema requires no code
changes.
