# Changelog

## [0.29.0] - 2026-10-08

### Added — the requirement entity, and five worked examples of the hardest case

`docs/SCHEMA-PERSONAL-PROFILE.md` specified the *applicant* side of a comparison and named the
gap: the catalog's `eligibility.gpa_minimum` is **45 `null`, 0 numbers, 5 prose**, so a
comparison against it can only ever return `unknown`. This adds the other side, and the proof
that a schema can hold what providers actually publish.

**Requirements get their own file, not more fields on a record.** The catalog's unit is the
*scholarship*; requirements live at the level of the *program* or *institution*, and one record
can span many of the latter — `daad-study-scholarships` names "German higher education
institutions", `csc-government-scholarship` names no university at all. `data/requirements.json`
is keyed by record id and holds zero or more requirements per record. The sourcing pass therefore
touches one file, and `data/scholarships.json` is never rewritten.

**The rule carries a `kind`, and the `kind` is the whole point.** `none-stated` ("the provider
states there is no threshold") and `unstated` ("the catalog has not looked") are opposite claims
that the current `null`/number/string shape **cannot tell apart** — both are "no number". The
schema separates them, along with `branches` (several figures, e.g. one per scale), `percentile`,
`rank`, `prose` (no single scalar form) and `numeric`.

**Five records, chosen because they are the hardest.** All five of the prose requirements are
transcribed verbatim:

| Record | `kind` | Why |
|---|---|---|
| `gks-graduate` | `branches` | Four figures on four scales, plus a percentile and a rank alternative |
| `mext-research-students` | `branches` | Two thresholds split by **field**, not scale — so branches carry `applies_to` |
| `groundwater-emjm` | `prose` | Two different grading systems, joined by "or equivalent" rather than a rule |
| `kaust-fellowship` | `numeric` | The rare clean case: `3.0` on `4.0`. Its "90% of admitted applicants score above 3.3" is **context, not a requirement** |
| `pec-pg-brazil` | `none-stated` | Explicitly no threshold — the case that must never render as "we do not know" |

**The validator was proved to fail before being trusted.** `scripts/validate-requirements.mjs`
is **stage 3 of `npm test`** and rejects twelve defect classes, every one of them verified to
fire by planting it and watching the exit code change: a numeric rule with no scale, an unknown
`kind`, a `record_id` that is not a record, a missing `source`, a future `last_verified`, an
impossible date (`2026-02-30`), a `prose` rule carrying a number, `none-stated` with no quote,
`branches` with a top-level number, a single-branch "branches" array, an empty requirements
array, and a minimum above its own scale.

`npm test` 163 tests → **163 tests, now a 4-stage chain**. `data/scholarships.json` is untouched,
and **nothing in the app reads the new file yet** — this is the shape the Phase 2 sourcing pass
will write into.

## [0.28.0] - 2026-10-08

### Added — reading the reader's own documents (Phase 1 of the ingestion design)

`docs/DOCUMENT-INGESTION.md` was a proposal, not code; its §11 named what to build first and
this is that part. Phase 1 is the half that was **unblocked**: local extraction feeding the
profile, with the PDF reader deferred and the model path off.

**A `.docx` is read with zero new dependencies.** A DOCX is a ZIP of XML, so `src/ingest.js`
carries a minimal central-directory reader plus `DecompressionStream` for the inflate — both
baseline in browsers and present in Node 24. Plain text (`.txt`, `.md`, `.csv`, `.json`) needs
nothing at all. The PDF reader is ~1.4 MB, about three times the current bundle, and is
**refused with that reason on screen** rather than guessed at.

**The deterministic extractor proposes; it does not decide.** GPA/CGPA **with its scale**, IELTS
(with sub-scores), TOEFL iBT, PTE, Duolingo, and UK/Commonwealth degree classifications. Every
proposal carries the **span it was read from**, is editable, and is not used until the reader
confirms it — the same rule the catalog applies to its own records.

- **A GPA without a scale is not a GPA.** A bare `CGPA 3.1` is reported as *incomplete* with the
  reason, never assumed to be `/4.0`: the catalog's own GKS record states its threshold four
  different ways depending on the transcript's scale, which is exactly why assuming one would
  invent a comparison.
- **A value outside its instrument's range is quoted but not proposed.** The catalog records
  KAUST printing "TOEFL iBT 5 overall" — inside the arithmetic envelope of 0–120 and impossible
  for a real total, because the four sections each score at least 1. The instrument's own
  **floor** catches it; ScholarHub does not repeat an impossible value as if it had read one, and
  does not silently "fix" it.
- **An unreadable document is a refusal, not an empty result.** A scanned PDF, a JPEG renamed
  `.txt`, a corrupt `.docx`, an empty file and an out-of-range score each produce an explicit
  refusal with a reason. A blank profile would read as "this person has no GPA", which is a
  different and false claim.

**`src/compare.js` — three-valued, and `unknown` is the default.** `meets` / `fails` / `unknown`,
with five distinct sentences for the five different facts, kept deliberately apart:

- the requirement is met; the requirement is not met;
- **the provider states there is no threshold** (PEC-PG's Edital);
- the requirement is recorded as prose with no single scalar form (GKS's four scales, MEXT's
  field split);
- **the catalog does not record a requirement at all.**

The last three all report `unknown`, but must never share a sentence — *"this provider has no GPA
threshold"* and *"we do not know this provider's GPA threshold"* are opposite claims. Collapsing
them would be a lie in one direction or the other. A comparison engine whose default is `meets`
would tell an applicant they qualify when the catalog simply never said.

**The measurement reproduced live, not restated.** With a confirmed `3.62 / 4`, the profile page
reads **0 met · 0 not met · 50 not checkable** and names the number: 45 of 50 records do not
record a GPA requirement. That is the design document's finding, now rendered from the real
catalog by the real code.

**Bundle discipline held.** The reader and the extractor are a lazy chunk (`ingest.js`, 7 kB);
the panel is a second (`IngestPanel.jsx`, 8.9 kB); `compare.js` travels with the panel and the
per-record result is handed back to `App` rather than recomputed there. Main is 497 kB, under the
500 kB ceiling — **the limit was not raised.**

**Verified in a real browser, against a real `.docx`.** The transcript was generated as a genuine
Word file (ZIP + WordprocessingML, a table with each label and value in its own cell). All four
values extracted, each confirmed, three chips rendered with their source file, the state survived
a reload, and contrast was measured in both themes (dark 5.66:1 worst, light 4.79:1 worst, all
above WCAG AA).

**Two defects found by reading the live output, not the code:**

- **Every pattern required a label and its value on one line, and every fixture was written that
  way** — so the tests passed while a real Word table extracted nothing. A table puts each cell's
  paragraph on its own line, so a transcript reads `CGPA\n\t3.62 / 4.0`. The label gap now
  spans at most one line, with a regression test on both sides: the table shape must extract, and
  a label must not reach across a blank line to an unrelated number.
- **The confirming click did not pass the file name and the value was not persisted.** The chip
  rendered "from " with nothing after it, and a confirmed value was lost on reload — a bug the
  reader could not distinguish from the app ignoring them. Both fixed, both now asserted.

`npm test` 118 → **163 tests**; the render smoke test 19 → **27 renders** (a third scenario for
the confirmed-value state, plus two document-panel cases).

### Still not built, and said on screen

The comparison says `unknown` for **45 of 50 records**, because the catalog does not carry
requirements as data. Phase 2 — a sourcing pass across the catalog, giving each record a
requirement shape that can hold what providers actually publish, with `source` and `last_verified`
per requirement — is **a data decision for the owner, not a coding task**, and the engine is
written so it turns on without a rewrite when that data lands. OCR for scans remains deferred:
largest dependency, least reliable output.

## [0.27.0] - 2026-10-07

### Added — the three things v0.26.0 said were missing

The previous release shipped the provider seam and listed three gaps on screen. This closes all three.

**Streaming replies.** Three of the four transports stream as Server-Sent Events and Ollama streams newline-delimited JSON; `parseStreamChunk` handles both, and the reply is written into the transcript token by token instead of appearing after a pause.

- **Streaming is attempted, never assumed.** It falls back to a single request when the browser cannot read a stream, when the provider refuses the streaming request (a compatible server may not recognise `stream_options`), or when the stream ends without producing any text — because **a stream that yields nothing is a failure, not an empty answer**. The reply says which path was taken.
- **A stream is a fallible iterator.** An error frame can arrive mid-stream; it is surfaced rather than swallowed, and text received before the error is kept rather than discarded. Treating a stream as infallible is how a caller hangs on a promise that will never settle.
- Google streams from a different method (`:streamGenerateContent`) and needs `alt=sse`; both are set, and a test asserts the non-streaming method is *replaced* rather than appended to.
- `splitStreamBuffer` carries a partial line into the next read — a chunk boundary can land mid-line, and the naive `split('\n')` loses whatever follows it.

**Cost accounting.** `estimateCost` multiplies the provider's published per-million-token price by the token count it reported. It returns **`null` rather than a number it cannot support** — the same rule this catalog applies to deadlines and award amounts.

- A model with no published price is reported as **uncosted, not as $0.00**. A local Ollama model is the common case: the usage is real, the price does not exist, so the cost is unknown.
- A half-known cost is marked `partial`, so the interface says *"input or output only"* instead of presenting half a figure as the total. Anthropic is the reason this matters — it reports input on `message_start` and output on `message_delta`, and taking the last report would silently halve the number.
- `mergeUsage` folds those split reports together without letting a later, emptier one erase an earlier value.
- The settings page shows a running session total with a plain statement of what it is not: **not a bill** — caching, batch discounts, tiers and reasoning tokens are not accounted for.

**Model fallback, explicit and disclosed.** A reader can name a second model. It runs **only after the first fails**, never instead of it, and **the answer always says which model replied** (`fell back from …`). Silently swapping models is the kind of quiet substitution this project tries not to do.

### Verified live

Against a local Ollama, end to end:

- The connection test returned **"Connected. Ollama answered using qwen2.5-coder:1.5b. ready — 36 tokens in, 2 out"**.
- **Streaming was observed, not assumed.** Polling the transcript while a reply arrived gave **0 → 426 → 561 characters** in distinct steps. A non-streaming reply jumps from nothing to the whole answer in one step; this did not.
- The spend line correctly reported **"no priced calls across 1 call · 1 uncosted — this provider publishes no per-token price for the model, so the cost is unknown rather than zero."** An earlier draft of that sentence said "no reported usage", which was wrong — the usage *was* reported and it is the price that does not exist. The transcript note was corrected the same way.

### Verification

- **118 tests, 0 errors / 0 warnings** — up from 99. `src/chat.test.js` gained 19, covering each transport's stream deltas, `[DONE]`, keep-alive comments, event-name lines, malformed lines, mid-stream error frames, buffer splitting across a chunk boundary, CRLF streams, and the cost rules including the partial and unpriced cases.
- **The render smoke test went 18 → 19 renders**, adding a case for the fallback selector.
- Main bundle **495.57 kB**, still under the warning threshold; the AI settings chunk is 12.94 kB.

## [0.26.0] - 2026-10-07

### Added — the AI side is real now

The settings page had been a placeholder since the first release: a provider dropdown that did nothing, a key field nothing read, and a "Test connection" button that only printed a notice saying adapters were not connected. This release builds the seam AGENTS.md had reserved, and connects it end to end.

- **`src/providers.js` — the registry.** **21 providers across four categories**, each declaring its transport, its **auth kind**, its default base URL, where to get a key, and the endpoint that lists its models.
  - **Frontier labs (7):** OpenAI, Anthropic, Google (Gemini API), xAI, DeepSeek, Mistral AI, Cohere.
  - **Inference providers (7):** OpenRouter, Groq, Together AI, Fireworks AI, DeepInfra, Cerebras, and *any* OpenAI-compatible endpoint you name yourself.
  - **Local runtimes (6):** Ollama, LM Studio, llama.cpp server, vLLM, Jan, LocalAI.
  - **Signed-in session (1):** Antigravity (AGY) — see below.
- **`src/chat.js` — the adapter.** Four real transports (OpenAI-shaped, Anthropic, Google, Ollama), each with its own URL shape, headers, body and reply parser; model discovery per provider; and error handling that maps a status to the advice that actually helps. Anthropic's browser-origin opt-in header is sent, because without it the API refuses a page-originated call.
- **`src/useAi.js` and `src/AiSettings.jsx`** — the connection state and the settings view. A **real connection test** that makes an actual call and reports what came back, model discovery with a refresh button, a base-URL override, and a per-provider line saying **where the request will go**.
- **The assistant is connected.** With a provider configured, the assistant answers through your own model, grounded in the catalog rows for your profile — and the prompt forbids inventing a deadline, an amount or an eligibility rule. A model answer is labelled *"from <provider> — a model answer, not catalog data"*. Without a provider it stays on the offline guide, exactly as before.

### Antigravity, and why "login" is not a form here

`agy` (the Antigravity CLI) authenticates through **its own Google sign-in on your machine** — there is no API key to paste. A page in a browser cannot start a process, read that session, or hold your Google credentials, so a login form would be theatre. The connect panel says that plainly and offers the two routes that genuinely work from a page:

1. **The Gemini API**, where Google publishes an Antigravity Agent model (`antigravity-preview-09-2026`) reachable with an ordinary API key.
2. **A local gateway** — run an OpenAI-compatible bridge (a LiteLLM proxy is the usual choice) in front of the CLI and point *Any OpenAI-compatible endpoint* at `http://localhost:4000/v1`.

Neither route gives ScholarHub your Google credentials. That is the point.

### Model names are discovered, not asserted

A roster is stale within weeks, so **every provider that publishes a list endpoint is queried at runtime and that answer wins.** `FRONTIER_SEED` exists only so the picker is not empty before a key is entered: 13 models across four labs, each carrying the **URL it came from and the date it was read**. Anything the source did not publish is `null` and renders as an em dash — the same rule the scholarship catalog applies to deadlines. Google's models index, for instance, publishes ids but not limits, so its seeded entries have no context window rather than a guessed one.

Sources read 2026-10-07: OpenAI (GPT-6 Astra / 6.1 Sol / 6 Luna), Anthropic (Claude Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 4.5), Google (Gemini 3.8/3.7/3.6 Flash, 3.1 Pro preview), xAI (Grok 4.7). A search for "frontier models 2026" returned only aggregator blogs contradicting each other on the names — those were discarded and the providers' own docs fetched instead.

### Verified against a real model, not a mock

- **A live end-to-end call.** With a local Ollama running, discovery reported **10 real models**; selecting `qwen2.5-coder:1.5b` and pressing *Test connection* returned **"Connected. Ollama answered using qwen2.5-coder:1.5b. ready — 36 tokens in, 2 out"**, and the assistant then answered a real question through it.
- **The failure paths are honest too.** No key → *"This provider needs an API key. Get one at …"*. A missing model on a reachable server → *"Ollama returned 404. The base URL or the model id is usually the cause"* plus the provider's own message. An unreachable host is described as one of three things, because **a browser will not say whether it was DNS, a refused connection or CORS**.

### Fixed

- **`.privacy-note` had no dark-mode counterpart** — the one surface the earlier dark pass missed. It kept its light background (`#f2f6ee`) in dark mode, so it read as a bright panel on a dark card **and its text measured 4.01:1, under WCAG AA**. It appears on the profile page too. Now 6.65:1 on a dark surface.
- **A local runtime with nothing pulled was unusable.** The model field was a `<select>` with no options and no way to type one, so a custom endpoint could not be configured until a discovery call happened to succeed. It now falls back to a free-text field.
- **Eight icon imports were dead**, two of them left by the old settings view.
- **The main bundle crossed the 500 kB warning threshold** at 500.04 kB. Rather than raise the limit, the settings view is now a lazily-loaded chunk: the main bundle is back to **490.22 kB** and the AI settings arrive as an 11.57 kB chunk only when opened. The assistant still works without it, because its default is the offline guide.

### Verification

- **99 tests, 0 errors / 0 warnings** — up from 40. The new suites are `src/providers.test.js` (registry integrity, provenance on every seeded model, an unpublished number is `null` and never a guess, no security claims in the egress line, key masking) and `src/chat.test.js` (each transport's URL, headers and body; system-turn handling for Anthropic; role mapping for Google; reply parsing for all four; model-list normalisation; error mapping; **and that a key never reaches a request body**).
- **The render smoke test went from 12 to 18 renders**, with five new cases covering each auth kind — a key, no key, and the CLI session — plus a check that **a remembered key never reaches visible text or any attribute other than the password field it belongs to**. The AI settings view is rendered directly with the real `useAi` hook, so taking it off the main bundle did not take it out of the gate's reach.
- Verified in a browser: all 21 providers listed, each auth panel rendering for its kind, model discovery against a live Ollama, a real chat round-trip, and the assistant falling back to the offline guide when the connection is cleared.

## [0.25.0] - 2026-10-07

### Added — the gate that was missing

v0.24.0 shipped a live crash: the shortlist view still read a `FLAG` table deleted six versions earlier, so opening *My shortlist* with anything saved threw `ReferenceError: FLAG is not defined` and blanked the app. **Every check in the repository was green on that defect.** This release closes the hole rather than just patching the symptom.

**`scripts/render-smoke.mjs` — render every view.** It loads `src/App.jsx` through Vite's SSR transform and renders all six views twice: once against an empty browser and once against a populated one (saved ids, tracked applications, ticked documents, a profile with a country set). **12 renders.** Rendering is the only thing that executes a view's branches, and the populated pass is what reaches the branches that only run when there is data — which is exactly where the crash lived. No new dependency: Vite handles the JSX and the CSS import, `react-dom/server` does the render, and `localStorage` is a stub.

**`src/App.jsx` split from `src/main.jsx`.** The app could not previously be loaded outside a browser, because a module-level `createRoot(document.getElementById('root'))` ran on import. `App.jsx` now holds the application and stays free of mount-time DOM access; `main.jsx` is a three-line entry that mounts it. `App` takes an optional `initialView` prop — a seam for the test, defaulting to the real entry view, which nothing in the app passes. `git mv` preserved the rename in history.

**`.github/workflows/ci.yml` — the repository had no CI at all.** `.github/` held only issue and PR templates, so `npm test` and `npm run build` ran only when a developer remembered to type them. The workflow runs `npm ci`, `npm test` and `npm run build` on every pull request and every push to `main` — the *same canonical command* as the local gate, so a stage added to the `npm test` chain is covered remotely without touching the workflow. `permissions: contents: read`; Node pinned to major 24 to match the development runtime. Validated with `actionlint` 1.7.7 (exit 0).

`npm test` 232ms → **930ms**.

### The guard was proved to fail

A guard that has never been observed to fail is not a guard. Both violations were planted in a throwaway `git worktree` and never committed:

| Planted defect | `node --test` | `validate-catalog` | `npm run build` | `render-smoke` |
|---|---|---|---|---|
| `FLAG[s.country]` restored in the saved view (the historical defect) | ✅ pass | ✅ pass | ✅ pass | ❌ **exit 1 — "threw ReferenceError: FLAG is not defined"** |
| Tracker empty-state heading renamed (a content regression) | ✅ pass | ✅ pass | ✅ pass | ❌ **exit 1 — "expected to find …"** |

All three pre-existing gates stay green on the exact defect that shipped. The new gate catches it and names the view. The worktree was removed and `git status` verified clean.

### Deliberately not done

**`verify` is not registered as a required status check.** Branch protection requires a pull request but not a passing check, so CI can still be red while a merge succeeds. Making it required is an externally visible change to the merge gate, so it is left as a decision for the owner — the context name to require is exactly `verify`.

**No `.nvmrc` was added.** Pinning the toolchain in a version file is a project-wide decision; the workflow pins Node 24 instead, which removes the local/CI skew for CI without changing what a contributor's shell picks up.

### Notes

- `npm run check:links` is deliberately excluded from CI. It probes official links over the network, and this project's own documentation records that a 401/403/405/429 from a government or university site means *unverified, not broken*. In CI it would go red on network weather and teach everyone to ignore the pipeline.
- There are still no git hooks in this repository. Local checks are feedback, not enforcement; the remote job is the authoritative layer.

## [0.24.0] - 2026-10-07

### Added — an application tracker, and a document checklist

Two things a reader does *after* discovery: decide which programmes they are actually going for, and work out what paperwork is still missing. Both are new, both are local-only, and both live in a new pure module so the awkward part — dates — is testable.

- **Application tracker.** Any opportunity can be tracked from the discovery board, from the shortlist, or from the detail dialog. Each tracked application carries a **status** (Planning to apply → Preparing documents → Submitted → Awarded → Not selected) and a **live countdown** to its closing date. The list sorts by urgency: passed first, then due today, then nearest, then records with no published date, with submitted and decided applications last.
- **Deadline alerts.** A banner and a nav badge count only what is still actionable — an application whose date is near or gone **and** whose status is still open. A submitted application whose date has passed is history, not a task, so it is reported in the summary and left out of the alarm.
- **Document checklist on the profile page.** Twelve documents an applicant is ordinarily asked for, each markable as present or not present, with a progress bar and an alert naming exactly what is missing. **The checklist is degree-aware**: a research proposal and a publication list are required of a PhD or PostDoc goal and are shown as optional, untagged-as-missing, for a Master's.
- **`src/tracker.js`** — the pure module behind both. 22 unit tests, all offline. `npm test` now runs **40 tests** and remains **0 errors / 0 warnings**.

### The honesty rules this keeps

The catalog carries a single verified closing date on **13 of its 50 records**; the rest describe a window, a field split or a country rule in `deadline_notes`. The tracker therefore:

- **Never invents a date.** A record without a `deadline` is reported as *"No single closing date"* and shown with its note — it is not given a countdown, and it is not dropped from the list either, because a programme whose window is unstated is exactly the one a human has to go and look up.
- **Reports a passed deadline as passed** — *"Passed 129 days ago"*, not hidden or re-labelled. Whether the next cycle is open is the provider's statement to make.
- **Does not cry wolf.** Ten unticked documents on a brand-new visit would put a "10" badge on a first-time reader, so document alerts only start counting once the reader has engaged — by ticking something, or by tracking an application. The profile page always states the full list; the badge is only about interrupting.

### Two defects found and fixed on the way

- **`FLAG[...]` on the shortlist view was a live crash.** The hand-written flag table was deleted in v0.21.0 when flags became derived from ISO codes, but the shortlist's compact card kept reading it — so opening *My shortlist* with anything saved threw a `ReferenceError` and blanked the app. It now uses `flagFor()` like every other surface. Nothing caught this: `npm test` reads the catalog and never the component, and the build only proves the identifier is referenced, not that it exists at runtime.
- **`Date.UTC` silently rolls an impossible date over.** `new Date(Date.UTC(2026,1,30))` is 2 March, so `2026-02-30` would have become a plausible-looking countdown instead of being rejected. `toUtcDay` now reads the parts back and refuses anything that did not survive the round trip. Caught by a test asserting an impossible date is `null`, not a number.

### Verification

- **22 new unit tests**, including: a one-day gap across a daylight-saving shift is exactly one day (the reason dates are compared as UTC calendar days rather than by subtracting `Date` objects); an unusable date is `null` rather than `0`, so "could not parse" can never read as "due today"; the urgent and due-soon windows sit on their stated boundaries; an unrecognised stored status or document id cannot invent state; and every one of the 50 real records produces a labelled countdown.
- **Browser-verified** end to end: tracking from the board and the shortlist, "Track all of them", the status pipeline moving a record out of the alarm and to the bottom of the list, the document checklist going 0 → 7 → 12 of 12, and the PhD/Master's switch changing the required set from 10 to 12. Responsive at 700px and 480px with no horizontal overflow.
- **Every new colour pair measured**, light and dark, against its own surface — 31 pairs, all ≥ 4.5:1 for text (≥ 3:1 for the progress bar). Urgency is carried by colour but never *only* by colour: each chip spells out "Due in 5 days" or "Passed 3 days ago".
- Screenshots added for the tracker and the checklist in both themes; the discover captures were re-taken because every card gained a Track control.

### Note for the reader

Today the nearest future deadline in the catalog is **30 November 2026 (ETH Zurich ESOP, 54 days out)**, and six dated records carry a date that has already passed. So the "due soon" window is currently empty — the tracker will show *passed* and *later*, and the first due-soon alert will appear in late October.

## [0.23.0] - 2026-10-07

### Changed — three of the four `regional` records now give a real answer

`regional` was the loose end v0.21.0 left: it reported **check** for every reader, including readers the programme plainly was open to. Where a provider publishes its country list, that is a gap in our data rather than a property of the scheme — so the lists were transcribed from each provider's own page and those records became `listed`.

- **Australia Awards Scholarships** — 59 countries transcribed from DFAT's participating-countries page: **25 in Africa, 17 in Asia, 17 in the Pacific**. A reader from Nepal or Kenya now sees *Open to you*; Brazil, which is not on the list, sees *Not open to you*.
- **Manaaki New Zealand Thematic Short Term Training** — 68 countries transcribed from the scheme's eligible-country list across the Pacific, ASEAN, Africa and Latin America and the Caribbean.
- **NL Scholarship (formerly Holland Scholarship)** — the scheme states the criterion as **"Your nationality is non-EEA"**, so the record carries the **30 EEA members as an exclusion** rather than expanding the rule into a 172-country complement. A reader in the Netherlands sees *Not open to you*; everyone else sees *Open to you*.
- **`nationality_scope` gained `excluded_countries`** for rules published in the negative. Use the shape the source uses: expanding "non-EEA" into a list of eligible countries would bury the rule and make it unreviewable. The validator rejects both-shapes and neither-shape.

### Two source contradictions, recorded rather than smoothed over

- **The NZ page names Singapore under ASEAN *and* in its exclusion list.** It says applicants must not be citizens or permanent residents of a separate list of 20 countries — Singapore among them. The exclusion is an explicit "must not", so it governs: **Singapore is omitted from the eligible list** and the contradiction is stated in the record's note.
- **The Australia Awards prose says "particularly those countries located in the Indo-Pacific" while the list spans Africa as well.** The transcribed list is what governs; the note records where it came from and that DFAT republishes it per cycle.

### One record stays `regional`, on purpose

**Pan African University** remains `regional` / `["Africa"]`. Its eligibility is "African countries **and the African Diaspora**" — the Diaspora is not a country list, so enumerating AU member states would tell a member of the Diaspora *Not open to you*, which the source never said. It reports **check for every reader, including readers in Africa**, and the note names what has to be checked. This is the honest outcome for this record, not an unfinished one.

### Verification

- **18 tests**, up from 16, including two that pin the exclusion shape: a country outside the exclusion is eligible, and — the dangerous inversion — **an exclusion list is never read as a list of eligible countries**.
- **Browser-verified across three countries.** Nepal: Australia Awards *Open to you*, NL Scholarship *Open to you*, Manaaki Thematic *Not open to you*. Kenya: all three *Open to you*. Brazil: Australia Awards *Not open to you*, the other two *Open to you*. The check-eligibility count fell from **15 to 12**.
- The whole-catalog diff is **169 insertions / 18 deletions** — the first attempt at this change re-serialised the file and inflated the diff to 696 / 114, which was reverted and redone as a per-record splice.

## [0.22.0] - 2026-10-07

### Added — Africa, the last Phase 2 region

Catalog 49 → **50 records**. **Africa opens as a destination**, which completes the Phase 2 breadth list: Canada, Japan, South Korea, India, Saudi Arabia, Brazil and now Africa.

- **Pan African University Scholarship** — the African Union's flagship postgraduate award, funded by the African Union Commission and taught across four PAU institutes: **PAUSTI** (Jomo Kenyatta University, Kenya), **PAULESI** (University of Ibadan, Nigeria), **PAUGHSS** (University of Yaoundé II and University of Buea, Cameroon) and **PAUWES** (University of Tlemcen, Algeria). Master's and PhD, with the engineering-relevant routes at PAUWES: **Water (Engineering or Policy), Energy (Engineering or Policy) and Climate Change (Engineering or Policy)**, plus a PhD in the **Water–Energy–Climate Change Nexus**.
- **The scholarship covers full tuition, living expenses and medical insurance** — and the source publishes **no stipend figure**, so no amount is recorded and the gap is stated instead of divided out or borrowed from an aggregator.
- **The 2026 call closed on 15 December 2025.** The call opens on 15 November and closes on 15 December each year, so the next window is 15 November 2026 — that rhythm is carried in `deadline_notes`.

### The finding: Africa is a restriction, and it cannot be resolved to a list

- **Eligibility is "African countries and the African Diaspora."** That is a regional rule, so the record carries `nationality_scope.mode: "regional"` with `regions: ["Africa"]` — and the app therefore reports **check**, not **open**, for every reader, including readers in Africa.
- **This is deliberate, and it is the limitation v0.21.0 documented.** A provider's "Africa" is not a continent: it is the set the provider admits, and "the African Diaspora" is not a country list at all. Inventing a 54-country mapping from general knowledge would put unverified data into a provenance-first catalog, and would tell a reader in an AU-ambiguous territory — or a member of the Diaspora — an answer the source never gave. So the record says what the source says and names what has to be checked.
- **The path to closing it is a country→region map sourced from each provider's own regional list**, not from a continent table. That is the next step on this specific gap, and it is recorded in `docs/ARCHITECTURE.md` rather than deferred silently.

### Notes

- **The destination is `Multiple countries`, not a single country.** The four institutes sit in four countries, so the record uses the existing grouping rather than pretending there is one host — consistent with how `Europe` is handled for the Erasmus Mundus records. Destinations therefore stay at **18** while records go to **50**.
- **Two restrictions are easy to miss and both are recorded.** The age limits are **25 for male and 28 for female Master's applicants**, and **28 and 30** for PhD — unusually, and distinctly, by gender. And **civil servants, employees of public or private companies, and students already holding a scholarship are not admitted**, because the programmes are residential and full-time. Awardees are expected to work in Africa after graduation.
- **Verified in the browser**: with no country chosen the card reads *Check eligibility*, and selecting **Nigeria** leaves it at *Check eligibility* — same record, same code path, honest answer rather than a guess.

## [0.21.0] - 2026-10-07

### Changed — the catalog is no longer written from one country's point of view

ScholarHub is public, and its readers are everywhere. Until this release the records were phrased from a single country's perspective, and the only way to learn whether a programme was open to you was to read the eligibility prose and work it out. This release makes country a first-class input: **choose your country, and the catalog answers for it.**

**Ask the question the data can answer, and refuse to answer the ones it cannot.**

- All 49 records now carry a structured `nationality_scope` whose `mode` is one of six deliberately distinct values: `all`, `listed`, `listed_elsewhere`, `regional`, `agreement`, `unstated`. **Two of those are answerable from the data; four are not.**
- **`unstated` is never rendered as "open to everyone."** A programme restricted to a region, decided by bilateral agreement, or silent on nationality is reported as **check** — naming what the reader has to look up — rather than guessed at. A silent default here would tell every visitor they are eligible, which is the one thing this must not do.
- `mode: "all"` requires a `note`, so the claim is attributable to something a contributor actually read.

### The retrofit: 34 rewrites, no facts deleted

The migration was **additions-only first** — the country-specific facts were moved into a new `country_notes` field, **463 insertions and 0 deletions** — so nothing was lost before anything was rewritten. A second pass then generalised the prose in the records that apply broadly but were written country-first.

- **34 prose rewrites across 16 records.** A record that said "Nepal is in the Partner Country group" now says "Partner Country applicants fall under separate scholarship quotas", and Nepal's group membership lives in `country_notes`, where the app surfaces it only when Nepal is the selected country.
- **The records that genuinely *are* country-specific kept their country names**, because there the country is the finding rather than the framing: the MEXT embassy call, the Nepal-only ICCR scheme, and the Canada-focused CGRS. PEC-PG keeps its 74-country restriction in the prose too — it applies to 74 countries, and the list is the point.
- **17 records** now carry `country_notes`. The facts they hold — quotas, age caps, national deadlines, exclusions — are no longer buried in a general field where they were told to every reader.

### Added — a country picker, a verdict on every card

- **`data/countries.json`** is the single source of truth for both name spaces: **202 real countries and territories**, each with an ISO 3166-1 alpha-2 code, plus the two destinations that name a grouping rather than a country (`Europe`, `Multiple countries`). A grouping may be a destination but is never a valid nationality, and the validator rejects it in a list.
- **A verdict badge on every card** — *Open to you*, *Not open to you*, *Check eligibility*, or *Choose your country*.
- **An "Open to my country" filter**, live only once a country is chosen, with the disabled state explained rather than silently inert.
- **The detail dialog** explains the verdict and surfaces the note for your country specifically.
- **The profile field became a picker** over the 202 country list instead of a free-text box, so a typo can no longer silently produce the wrong answer.
- **The assistant answers with your country in hand** — it reports how many opportunities are open to you and how many are not.

### Removed — the hand-written flag table

`src/main.jsx` carried a `FLAG` map keyed by country, and a new country missing from it rendered a generic globe **with nothing to warn anyone** — a defect that recurred in four consecutive passes.

- **Flags are now derived** from each country's ISO code as a pair of regional indicator symbols (`src/countries.js`). Adding a country is a one-place change, and the "missing flag" failure is now impossible rather than merely detectable.
- The old test read the component's source to check that table. It is replaced by three tests that check the data the derivation reads, plus the boundary that a grouping is a destination but never a nationality.
- A side-finding: the old map gave `Europe` an EU flag that the component never used, because Europe was already special-cased to a globe icon. Europe is a regional grouping, not the EU, so it stays a globe.

### Verification

- **The eligibility logic moved into `src/eligibility.js`** so the six modes can be unit-tested — 16 tests in total, including that **only `all` and `listed` can ever answer yes or no**.
- **12 negative controls** for the new validator gate, each proving an assertion fires and names the right record, and **5 mutations** of the eligibility module, all caught.
- **Verified in the browser.** The 8 `listed` records split differently by country: for **Nepal**, PEC-PG, CGRS, NSF, SI and NZ Vocational read *Not open to you* while NZ Scholarships, MEXT and ICCR read *Open to you*; for **India**, PEC-PG flips to *Open to you* and SI flips to *Not open to you*; for **Brazil**, NZ Scholarships and MEXT close while SI opens. Same records, same code path — the answer is a property of the country.
- The default state, with no country chosen, puts the 27 `all` records at *Open to you*, the 8 `listed` records at *Choose your country*, and all 14 unanswerable records at *Check eligibility* — including the three `unstated` ones, which is the invariant this release exists to protect.

### Notes

- **`regional` is not resolved to a country list, deliberately.** A provider's "Indo-Pacific" is not a continent, and inventing a country→region mapping from general knowledge would put unverified data into a provenance-first catalog. Those records report **check** and name the regions; resolving them needs each provider's own regional list, which is the next step rather than a shortcut.
- The three `regional` records, the seven `listed_elsewhere` records and the one `agreement` record are the ones that still send a reader to the provider. That is the honest outcome, not an unfinished one.

## [0.20.0] - 2026-10-07

### Added

Phase 2 continues, into Latin America. Catalog 48 → **49 records** and 17 → **18 destinations**, opening **Brazil** — and this one arrives with its restriction at the front rather than buried at the back.

- **PEC-PG (Programa de Estudantes-Convênio de Pós-Graduação)** — Brazil's government scholarship for postgraduate study in Brazil, run jointly by CAPES, the Ministry of Foreign Affairs and CNPq. It funds a full master's of up to 24 months or a doctorate of up to 48 months at a Brazilian institution, and a shorter **"sandwich" doctorate** of 6 to 10 months for candidates already enrolled in a doctorate at home. The 2025 call offered **650 scholarships** — 350 sandwich doctorates, 200 master's and 100 full doctorates — on a budget of up to **BRL 41,050,000**. It pays **BRL 3,100 a month for a doctorate** and **BRL 2,100 for a master's**, plus a **BRL 400 monthly health-insurance allowance** paid as a single first instalment, and a return airfare funded by the MRE. The 2025 windows closed on 8 October 2025 for the full modalities and 16 January 2026 for the sandwich doctorate.

### The finding: Nepal is not on the list

- **PEC-PG is restricted to nationals of a named list of participating countries, and Nepal is not on it.** Edital nº 12/2025 lists **74 countries** — 29 in Africa, 28 in Latin America and the Caribbean, 10 in Asia and 7 in Europe. The ten Asian countries are Bangladesh, China, South Korea, India, Iran, Lebanon, Pakistan, Syria, Thailand and Timor-Leste. **India and Bangladesh are eligible; Nepal is not.**
- **The rule behind the list is a cooperation agreement, and it was confirmed against a second, independent source.** The MRE states that countries holding an "educational, cultural or scientific and technological cooperation agreement with Brazil" may participate. Its current page lists **76 countries** for the *undergraduate* PEC-G programme — the same four regions, with Cambodia, Jordan and Mongolia added to Asia — and **Nepal is absent from that list too**. Two different lists, two different programmes, same exclusion, so it is not an artefact of a single document.
- **The Edital cites a country-list URL that 404s.** It sends readers to `…/temaseducacionais/…`; the live path is `…/temas-educacionais/…`. Both were probed directly — **404 and 200 respectively**. The record cites the working page and the Edital's own list, which is the operative text for the 2025 call, and notes that the Edital says the list may change as countries join before the application period ends.

### Notes

- **Two selection preferences actively favour applicants from outside Brazil**, which is worth stating because the headline restriction makes the programme look uniformly closed: for doctorate selections PEC-PG prioritises, wherever possible, candidates who took **both** their undergraduate and master's degrees outside Brazil, and for master's selections candidates who took their undergraduate degree outside Brazil.
- **There is no language test requirement, in either language.** The candidate declares their proficiency in the application form and the receiving postgraduate programme assesses the declaration against the language it has offered. Supporting documents may be in Portuguese, Spanish or English — with one exception: the **Lattes curriculum must be in Portuguese**, and Lattes is a Brazilian national CV platform, so a foreign applicant has to create one.
- **The amounts are in the Edital, not on the programme page.** CAPES's PEC-PG page lists the benefits as "mensalidade", "auxílio seguro-saúde" and "passagem Brasil – exterior" with no figures at all, and links out to a separate values page. The figures recorded here come from the Edital and the FAQ PDF, not from a summary. The FAQ also carries a practical warning the Edital does not: the first payment arrives up to 30 days after implementation, so the selected candidate must arrive with enough of their own money for **at least 60 days**.
- **No age limit and no minimum GPA are stated.** Rather than leaving those fields blank, the record says so and points at where the real bar lives — the individual postgraduate programme, whose requirements are cumulative with CAPES's.
- **The flag gate from v0.18.0 was exercised on live new data for the second pass running.** Adding Brazil to the catalog without touching `src/main.jsx` failed the suite, naming Brazil, before the flag was added and the suite re-run green.
- `npm test` stays at **0 errors, 0 warnings** across **3 tests**. The link probe covers **80 links: 0 dead, 7 unreachable** — and as this project's own notes keep insisting, the unreachable count is network weather rather than a property of the catalog — with **9 warnings, all pre-existing**, and both new URLs returning `OK [200]`.

## [0.19.0] - 2026-10-07

### Added

Phase 2 continues, into the Middle East. Catalog 47 → **48 records** and 16 → **17 destinations**, opening **Saudi Arabia** — and with it the first record in this catalog that carries no country quota at all.

- **KAUST Fellowship — King Abdullah University of Science and Technology** — a fully funded graduate fellowship at Saudi Arabia's research university on the Red Sea, and the first record here **open to applicants of any nationality with no country quota or Nepal-specific allocation**. The Fall 2027 deadline of **3 January 2027** is open to MS, MS/PhD and PhD applicants; the Spring 2027 round was **PhD-only** and closed on 27 September 2026. The Fellowship covers tuition and bench fees worth up to USD $35,000 a year, a stipend of USD $20,000 a year for MS students and USD $25,000 to $30,000 for PhD students, accommodation, health insurance and relocation, for a stated total of **USD $70,000 to $80,000 per year**. The MS takes 1.5 years (2 on the thesis track) over 36 credits and the PhD takes 4 years; the minimum GPA is **3.0 on a 4-point scale**, with KAUST noting that 90% of admitted applicants exceed 3.3. The record carries the full entry requirements — three referees and the seven-day submission window, the 750-word statement of purpose, the optional GRE/PGAT, the master's-degree requirement for PhD entry together with KAUST's refusal to treat professional master's degrees as equivalent, and the English-test rules including the exemptions that do *not* apply. It also names the research areas relevant to an energy, materials or environmental direction, from Materials Science and Engineering & Applied Physics to Earth System Science and Engineering.

### Fixed

- **A `city` and `region` pair that duplicated each other once the dialog joined them.** The record was written with `city: "Thuwal, on the Red Sea coast near Jeddah"` and `region: "Thuwal"`, and the detail dialog renders `{city}, {region}` — producing **"Thuwal, on the Red Sea coast near Jeddah, Thuwal"**. Corrected to `city: "Thuwal"` with `region: "On the Red Sea coast, near Jeddah"`. Found by reading the rendered dialog rather than the JSON — the same way the equivalent defect was found in the Canada and Japan pass.
- **A blank line splitting the ROADMAP progress table in two.** The row added in the previous release was separated from the one above it by an empty line, which ends a Markdown table — so the South Korea and India row was rendering outside the table it belonged to. The three rows are now contiguous.

### Added (test coverage)

- **The flag gate from the previous release was exercised against live new data, not a synthetic edit.** Saudi Arabia is a new `country` value, so adding it to the catalog without touching `src/main.jsx` should fail — and it did, on the first run and *before* the flag was added: `these catalog countries have no FLAG entry in src/main.jsx and would render a generic globe instead of a flag: Saudi Arabia`. Only then was `'Saudi Arabia':'🇸🇦'` added to the map and the suite re-run green. The gate built in 0.18.0 to catch this class of bug was therefore shown to fire on the real defect it was written for, not only on a hand-made one.

### Notes

- **KAUST describes its stipend as monthly and then prints only annual figures — GKS's mislabelled column in a different shape.** The page reads "a monthly stipend (worth USD $20,000 per year for M.S. students, and USD $25,000 to $30,000 for Ph.D. students…)". The word is *monthly*; the only numbers given are *per year*. The record quotes the annual figures verbatim, states the disagreement, and records **no monthly rate**, because dividing USD $20,000 by twelve would produce a number KAUST never printed.
- **An official English-requirements table prints a TOEFL score the test cannot produce.** KAUST lists "TOEFL iBT (Internet-based Test) **5 overall**, with at least 4.5 in all individual sections", and repeats the same scale in its conditional-admission table as "TOEFL score of **4.5** overall". TOEFL iBT is reported out of 120, so neither figure is a possible score. The other three tests are printed in their own native scales (IELTS 7.0, PTE 71, Cambridge 185), which makes the TOEFL row look like a normalised 0–6 scale left in the table by mistake. The record quotes both figures, states that they are unusable, and records **no TOEFL target** — the honest output is the gap, not a guess at 100.
- **A page can contradict itself about whether a window is open.** On 7 October 2026 the timeline page still carried the banner "Applications for Spring 2027 entry are now open" while its own table showed the only Spring deadline, 27 September 2026, already passed. The record says to trust the date table over the banner, and `status` is set from the Fall round's real date.
- **Third-party listings can quote a real date that is no longer actionable.** The aggregator pages that top a search for "KAUST scholarship 2027" all quote 27 September — which is genuinely on KAUST's own timeline, and is the **already-closed, PhD-only Spring round**, not the open Fall round. A date being correct is not the same as a date being current. None of those aggregators was used as a source; every figure in the record comes from `kaust.edu.sa` or `admissions.kaust.edu.sa`.
- `npm test` stays at **0 errors, 0 warnings**, and the link probe covers **78 links: 0 dead, 6 unreachable, and 3 non-200 responses from hosts that block automated requests** (two campuschina URLs returning HTTP 412, the University of Melbourne graduate-research page returning 403). Both new URLs return `OK [200]`, and all nine probe warnings are pre-existing — none involves a KAUST URL.

## [0.18.0] - 2026-10-07

### Added

Phase 2 continues. Catalog 45 → **47 records** and 14 → **16 destinations**, opening **South Korea** and **India** — and India brings the first record in this catalog that is *reserved* for Nepal rather than merely open to it.

- **Global Korea Scholarship for Graduate Degrees (GKS-G)** — NIIED's flagship graduate scholarship, inviting 2,000 international students a year. It funds a master's (one year of Korean language training plus two) or a doctorate (one year plus three), with tuition up to 5,000,000 KRW, Korean language training fees of 5,200,000 KRW, an economy-class flight and a settlement allowance. **Nepal's quota is 4 places on the Embassy Track and 6 on the University Track — 10 in total** — read directly from the guidelines' quota tables. The 2026 Embassy Track window ran 12–25 February 2026 and the cycle finished in July, so the record is `closed` with a real dated deadline; the 2027 graduate guidelines had not been published, though the 2027 *undergraduate* programme was announced in September 2026.
- **Sushma Swaraj Silver Jubilee Scholarship Scheme (SSSJSS)** — an ICCR scheme with **64 places reserved for Nepal**, 60 postgraduate and 4 doctoral, funding a master's or a doctorate at an Indian university. It is the postgraduate counterpart to ICCR's much broader Atal Bihari Vajpayee General Scholarship Scheme, which the same Embassy of India, Kathmandu notice runs for undergraduates. The Nepal notice gave the 2026-27 closing date — **15 April 2026** — the portal opening date of 27 February 2026, the NRs 400 application fee and the exact two-step submission process, the age caps (35 for postgraduate, 40 for doctoral, measured as on 1 July 2026), the exclusion of medical, paramedical, law and integrated courses, the GMAT requirement for MBA, the mandatory 500-word English essay, and the Embassy's explicit statement that it does not accept applications through consultants or agencies.

### Added (test coverage)

- **A new gate that makes the last release's silent bug impossible to ship again.** `src/main.jsx` keys its flag emoji by hand rather than deriving them from the catalog, so a new country with no entry renders a generic globe *silently* — the fallback is the intended behaviour, `npm test` reads only the catalog and the build reads only the component, so nothing could catch it. There is now a test that parses the `FLAG` map out of the component, compares its keys against every distinct `country` value in the catalog, and **fails naming the country** if one is missing. Values that deliberately use the globe are listed in an explicit `GLOBE_ONLY` set, so the only way to add a country without a flag is to say in the test that you meant to. **The gate was proved to fail before being trusted:** removing India's entry produced `these catalog countries have no FLAG entry in src/main.jsx and would render a generic globe instead of a flag: India`, and the file was restored afterwards.

### Notes

- **A source can print a column heading that contradicts its own numbers, and the honest move is to report both.** GKS's benefits table is headed "Monthly Allowance" and then prints *annual* figures — 16,560,000 KRW per year for the degree programme. The record quotes the annual figures verbatim, states that the heading and the numbers disagree, and records no monthly rate, because dividing by twelve would be arithmetic on a figure whose meaning is not settled by the source.
- **ICCR does not publish what its own scholarships pay, and that is now written into the record instead of guessed at.** The ICCR scheme page says only "Stipend, HRA, Contingent Allowances, Thesis/Dissertation Allowance, Airfare, Tuition fee/OCF paid to Universities (Norms attached)" — and **no norms document is served from that page**. Neither of ICCR's two official guidelines PDFs in circulation contains a financial table for the general schemes; the only rates table either document prints is for its separate **AYUSH** schemes, which are different schemes. So the India record lists every component that is covered and records **no stipend figure**, while noting that two conflicting and both-unverified schedules circulate: an older ICCR schedule still carried on the High Commission of India Pretoria's page (INR 5,500 / 6,000 / 7,000 per month) and a higher one quoted by third-party sites (INR 18,000 / 20,000 / 22,000). The widely repeated second figure looks like the AYUSH rates — whose table does show INR 18,000 a month, but for *AYUSH undergraduate* courses.
- **A blocked host can be blocked in two different ways at once.** `www.iccr.gov.in` does not resolve at all (`ENOTFOUND`), while `iccr.gov.in` resolves but serves a TLS chain that Node cannot verify (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`); `curl` needs `-k` and even then `www.` fails. The record therefore links to the two ICCR-family URLs that actually resolve and verify — the **A2A application portal** and the **Embassy of India advertisement PDF** — rather than to the scheme page that describes the scheme best. A URL being the most *relevant* is not the same as it being *reachable*, and the liveness gate only sees the second.
- **A second Nepal-specific eligibility bar that appears nowhere in the international documentation**, after MEXT's 70%/CGPA 3.1 threshold in the previous release. ICCR's age caps for Nepal (35 for postgraduate, 40 for doctoral) are set by the Kathmandu mission and stated only on its own notice.
- `npm test` stays at **0 errors, 0 warnings** and now runs **3** tests instead of 2. The link probe covers **76 links: 0 dead, 7 unreachable, 2 blocked**, with both new URLs returning `OK [200]`.

## [0.17.0] - 2026-10-07

### Added

Coverage breadth, into Phase 2. Catalog 43 → **45 records** and 12 → **14 destinations**, opening **Canada** and **Japan** — the two Phase 2 destinations that could be resolved on official sources rather than guessed at.

- **Canada Graduate Research Scholarship – Doctoral (CGRS D)** — CAD 40,000 a year for 36 months, administered jointly by CIHR, NSERC and SSHRC, and the doctoral award in the Canada Research Training Awards Suite introduced under Budget 2024. It supersedes the Vanier Canada Graduate Scholarships, whose own page now reads "The Vanier Canada Graduate Scholarships is no longer accepting applications". **The record leads with the restriction that matters most to this catalog's audience: CGRS D is not a way into a Canadian doctorate.** An applicant who is not a Canadian citizen, permanent resident or protected person must already be registered in a doctoral programme at an eligible Canadian institution *by the application deadline*, and only up to 15% of awards are reserved for international applicants. It also gained the 36-month-of-study cap, the three-application lifetime limit, the Vanier bar, the research-oriented-programme requirement, and the eight named priority research areas — among them clean technology and resource value chains, manufacturing and advanced materials, and food and water security.
- **Japanese Government (MEXT) Scholarship — Research Students (Embassy Recommendation)** — a monthly allowance of 143,000 to 145,000 yen depending on the course, waived tuition and fees, a return air ticket, and six months of preparatory Japanese-language education where needed. The record carries **Nepal's actual 2027 deadline, 31 May 2026 at 24:00 NST**, recovered from the Embassy of Japan in Kathmandu's own call, together with its examination date (18 June 2026) and interview date (30 June 2026) — all now past, so the Nepal route for 2027 is closed. It also carries the Nepal-specific academic bar (70% / CGPA 3.1 for Natural Sciences, 60% / CGPA 2.5 for Humanities), the age rule (born on or after 2 April 1992), the provisional-acceptance mechanics (up to three universities named, no more than two letters, contact only through international student affairs), and the warning that MEXT charges no application fee.

### Fixed

- **Two UI defects that only a rendered page could reveal — the validator and the build were both green throughout.** Adding a country is not a data-only change, and this pass was the first to prove it.
  - **The `FLAG` map in `src/main.jsx` is a hand-written object, and it had no entry for Canada or Japan.** The card renders `FLAG[s.country] || '🌐'`, so both new records would have displayed a generic globe instead of 🇨🇦 and 🇯🇵 — silently, because the fallback is the intended behaviour for a country that has no flag. `npm test` validates the catalog and never reads the component; the build compiles the component and never reads the catalog. Neither could have caught it. Both entries are added, and the map now carries a comment saying that every country the catalog can return needs an entry.
  - **The detail dialog dismissed every `deadline`-less record as "Not maintained — check official source".** That was actively wrong for the Canada record, which carries a **1,090-character** `deadline_notes` explaining exactly why the date has no year. The label now reads **"No single date — see the note below"** whenever a note exists, which points the reader at the explanation rather than waving it away. All 45 records currently carry `deadline_notes`, so the old string is now defensive code only.
- **The Japan record's `city` and `region` were both "Nationwide", and the dialog joins them as `city, region`** — rendering "Nationwide — the accepting university is assigned by MEXT after selection, Nationwide". Corrected to `city: "Assigned by MEXT after selection"` with `region: "Nationwide"`, matching the pattern the existing `jj-wbgsp` record already used. Found by reading the rendered dialog, not the JSON.
- **Three stale counts in the project's own documentation, carried forward unexamined.** The README's coverage summary still said **42** records while the catalog held 43; the same paragraph claimed China, New Zealand and the United States were level at 4 each when China had held 5 for two releases; and `docs/PROGRESS.md` said "Only **7 of 42** records carry a single verified closing date". All three are corrected here, and the verified-closing-date count is now **8 of 45** with MEXT added.

### Notes

- **A source can withhold a year, and that is different from a source being silent.** NSERC publishes the CGRS D deadline as "October 17" and gives **no year anywhere** — not in the overview table, not in the body text. The giveaway that this is a recurring annual date rather than a typo is the sentence immediately after it: if the deadline falls on a weekend, applications roll to the following business day. Nobody writes a weekend rule for a one-off date. The page was modified 8 July 2026, so the cycle it describes closes 17 October 2026 — but `deadline` is left `null`, because this catalog does not supply a year that a source withheld. The date lives in `deadline_notes` where it can be read without being asserted as machine-readable fact.
- **A recurring deadline is not the same as a missing deadline.** The ANSO record leaves `deadline` empty because the *next* cycle is unpublished. The CGRS D record leaves it empty because the *year* is unpublished. Different causes, same field treatment — and conflating them would have hidden one of the two.
- **HTTP 403 to `curl` is not the same as a page being unavailable, and neither is "Access Denied" in a browser.** The Embassy of Japan in Nepal returns **403 to `curl` and renders a literal "Access Denied" page in a real browser**, which reads as a dead end. `WebFetch` retrieved it without difficulty and returned the full call, including the deadline. Three tools, three different answers about the same URL: when one path is blocked, the block is evidence about the path, not about the page.
- **The deadline that matters is the mission's, not MEXT's.** MEXT sets no global deadline — its own guidelines say so ("The deadline for submission of application documents varies according to each Japanese diplomatic mission"). Recording 31 May 2026 without that scoping sentence would have implied a Japan-wide date that does not exist. The record names Nepal's date, states it is Nepal's, and notes the separate University Recommendation route.
- **A Nepal-specific eligibility bar can be invisible in the international documentation.** The 70% / CGPA 3.1 threshold for Natural Sciences is not in MEXT's guidelines at all — it is set by the Kathmandu mission and appears only on its own page. Anyone reading only the official English guidelines would miss a filter that decides their application.
- **A new country is not a data-only addition.** The destination filter derives itself from the catalog and picked Canada and Japan up automatically — but the flag map and the detail dialog are both hand-written against country values, and both were wrong. Adding a destination means tracing the value through the component as well as the catalog. `npm test` and `npm run build` were green the entire time: the validator reads the catalog and not the component, the build reads the component and not the catalog, and the flag fallback fails silently by design.
- `npm test` stays at **0 errors, 0 warnings** offline. The link probe now covers **73 links: 0 dead, 7 unreachable, 2 blocked**, with both new URLs returning `OK [200]`. The two blocks belong to pre-existing records rather than to this pass — campuschina.org answers **412**, and the University of Melbourne's graduate-research scholarships page answers **403**. Neither is a dead link and the gate treats both as warnings, which is the right classification, but the Melbourne 403 is worth re-checking on a future pass: it is the kind of response that can mean a page has moved rather than that it is refusing bots.

## [0.16.0] - 2026-10-07

### Fixed

**The validator's warning count reached zero — 5 → 0 — by answering the questions the warnings pointed at rather than suppressing them.**

Five records carried neither a `deadline` nor `deadline_notes`, so the validator warned on each. All five were investigated against their own sources, and every one turned out to have a real, statable answer:

- **Manaaki New Zealand Scholarships** — the biggest find of the pass. The record said only "Citizens of eligible partner countries". The eligible-countries page **names Nepal** in its Asian list (Cambodia, Indonesia, Lao PDR, Malaysia, Nepal, Philippines, Thailand, Timor-Leste, Viet Nam). Nepali applicants can use the postgraduate levels — Postgraduate Certificate, Postgraduate Diploma, Master's and PhD — but **not** undergraduate, which is offered to Timor-Leste only. The windows are country-specific rather than global: the page stated on 2026-10-07 that tertiary applications "have now closed", and the one window published that day was Samoa Foundation's, 4 August to 4 September 2026.
- **Fulbright Foreign Student Program** — the absence of a deadline is the design, not a gap. Applications are administered by binational commissions and U.S. embassies, and candidates submit "to their respective Fulbright office per established country/award deadlines". The record also gained the citizenship bar (**dual citizens are not eligible**), the language thresholds (TOEFL 550 paper / iBT 79-80 / IELTS 6.5), the ~4,000 grants a year, the four award benefits, and the clinical-programme exclusion — dentistry, medicine, pharmacy and nursing are out, public health and nursing administration are in.
- **University of Canterbury International First Year Scholarship** — real dates recovered, and only by rendering the page: it is JavaScript-rendered and returns nothing to a plain fetch (and HTTP 406 to a scripted request). "Applications for students who plan to enrol in their first year of an undergraduate degree at UC in 2027 opened 11 June and closed 6 August 2026"; the route for applicants qualifying overseas closes 15 April or 31 October. The provenance note is written into the record itself.
- **Tsinghua University Scholarships** — the page is a directory of routes, not a call; each route runs its own cycle, and the 2026 and 2024 editions listed are now recorded as such.
- **Chinese Government Scholarship (CSC)** — this one could not be closed, and the record now says why instead of leaving a blank. campuschina.org returned **HTTP 412** to every request over HTTP and HTTPS *and* rendered an empty page in a real browser; csc.edu.cn returned 412 as well; the host resolves only an IPv6 address; and the Chinese Embassy in Nepal's Study in China section carries no dated notice. The block is on this network, not on the portal, so the record is kept and the gap is stated rather than guessed.

### Added

- **The EESIC record gained the eligibility detail it was missing, from a document the site links but never surfaces inline.** Its FAQ links the previous 2026-2028 call as a PDF, and that PDF sets out the credit areas a bachelor's degree of at least 180 ECTS must cover — and they are a civil engineer's core: **Civil-Environmental Engineering minimum 30 ECTS**, Mathematics 24 ECTS, Physics and Chemistry (including Materials Science and Technology) 18 ECTS, Structural Engineering 12 ECTS. The record previously said the accepted fields "were not listed on the pages checked". They were, in the reference document.
- The same PDF gave the previous cycle's real closing date — **10 February 2026 at 12:00 CET** — now recorded in `deadline_notes` as a *reference*, explicitly not as the 2027-2029 date, because the page states the old call "is only a reference". `deadline` stays `null`.
- EESIC's empty `language_requirements` is filled: **B2 of the CEFR**, with the explicit list of accepted certificates and the rule that the certificate must still be valid at the deadline.

### Notes

- **A reference document is a legitimate source for structure and a bad source for dates.** The 2026-2028 call is the right place to learn what documents EESIC wants and which credit areas it scores; it is the wrong place to learn when the 2027-2029 call closes. That distinction let this pass add a dozen real facts without inventing a single date.
- **A JavaScript-rendered page is not an empty page.** The UC scholarship page yielded nothing to `curl` and nothing to `WebFetch`, which reads exactly like "the page has no dates". Rendering it in a browser produced the full award list with closing dates. Before recording "the source does not state it", render it.
- **HTTP 412 is a block, not a death.** campuschina.org answers 412 to everything, including a browser, and resolves only over IPv6. The link gate classifies 412 as a warning rather than DEAD, which is correct: the portal is alive, it just will not talk to this network.
- `npm test` now reports **0 errors, 0 warnings**, down from 5. Those 5 warnings had been stable and unexamined since the provenance pass, and every one of them was a real question with a real answer.

## [0.15.0] - 2026-10-07

### Added

One China record, catalog 42 → **43** and China 4 → **5**: the **ANSO-CAS-TWAS/UNESCO PhD Scholarship**, which was carried as a lead in 0.14.0 and is now resolved on evidence rather than left hanging.

- **ANSO-CAS-TWAS/UNESCO PhD Scholarship** — up to 40 PhD students a year from developing countries study in China for up to four years, funded jointly by ANSO, the Chinese Academy of Sciences and TWAS/UNESCO. Tuition, health insurance and the application fee are waived, the monthly stipend is CNY 6,000 or 7,000 for up to 48 months, and the award includes one return international travel allowance and a one-time visa allowance. Study is hosted at UCAS, USTC or a CAS institute. **Ten of the forty places are prioritised for climate-related research**, the closest thing in this catalog to a funding route aimed at the sustainability side of civil engineering.

### Notes

- **Nepal's eligibility was the blocker in 0.14.0, and it is now settled.** The scholarship page delegates eligibility to TWAS's developing-country list rather than naming countries, so the list itself was read: **Nepal is entry 088 of 138**. That is what turned the lead into a record.
- **No deadline is recorded, and the reason is not laziness.** TWAS labels the call "The call is closed". The 2026 cycle opened 15 October 2025 and closed 31 January 2026, and that is the only cycle any page describes. The 2027 call had not been published when this record was checked on 2026-10-07. The pattern across cycles is a mid-October opening — but a pattern is not a date, and writing the expected date into `deadline` would have produced a fabrication wearing a citation. `deadline` is `null`, `status` is `closed`, and `deadline_notes` carries the cycle, the pattern and a re-check prompt.
- **A CAS-ANSO call page published on 22 July 2026 was checked and did not help.** It still reproduces the 15 October 2025 – 31 January 2026 window, so it is not evidence of a new cycle either. A page can be freshly published and still describe a closed call.
- **The record does not claim civil engineering, because the source does not.** The scheme names ten umbrella fields and "06-Engineering Sciences" is the only engineering one; civil engineering, environmental engineering and materials science are not named as separate disciplines, and the host route is UCAS/USTC/CAS institutes rather than a named civil-engineering faculty. `program_field` therefore carries `["Engineering Sciences"]` — the exact named field — and `eligibility.other` tells the applicant to confirm the intended field with a specific host supervisor. "Civil Engineering" would have matched the four existing China records, and would have been invented.
- **The CAS-TWAS President's Fellowship was excluded again, on the same evidence as before plus one new fact.** Its only primary page found is the **2017** cycle — "maximum age of 35 years on 31 December 2017", deadline "31 MARCH 2017" — sitting on an official UCAS domain, which is precisely what makes it dangerous: an authoritative-looking page describing a nine-year-old call. Both plausible TWAS URLs for it now return **404**, and it does not appear on TWAS's current PhD fellowship index at all. Third-party aggregators claim a 2027 call is open; they are not citable and the claim could not be traced to a primary source.
- **README carried an internal contradiction and it is fixed.** The same paragraph said "six records carry a single verified closing date" in one sentence and "Seven records carry a single verified closing date" in the next. The catalog was counted: **seven** is correct.
- Link probe: **71 checked, 0 dead**; the new TWAS URL returns `OK [200]`. The unreachable count was 7 this run, inside the 6–7 range recorded in 0.13.0 — unchanged, and still not worth quoting as a fixed number.

## [0.14.0] - 2026-10-07

### Added

Two United States records, catalog 40 → **42** and the USA 2 → **4**. This was the region the roadmap called structurally hard, because most US graduate funding is restricted to citizens and permanent residents — so the pass was aimed at awards that are explicitly open to Nepali applicants, and the first thing it did was confirm that the existing records were honest about the restriction.

- **Knight-Hennessy Scholars (Stanford University)** — the strongest find. The programme states it "encourage[s] citizens and residents of all countries to apply", sets **no quotas by discipline, programme or world region**, and requires no institutional endorsement. It funds up to three years of any full-time Stanford graduate degree, including a master's or PhD in civil and environmental engineering: tuition and fees, a living stipend, one annual economy-class round trip, and a one-time relocation stipend. **Verified deadline 6 October 2026** for the 2027 cohort, which has now closed; the 2028 cycle opens in summer 2027.
- **Hubert H. Humphrey Fellowship** — a non-degree Fulbright fellowship for mid-career professionals, ten to twelve months at a U.S. host university with a professional affiliation placement. **Nepal is confirmed on the eligible-country list**, under South and Central Asia, and the programme is administered there by the Binational Fulbright Commission. It requires five years of full-time professional experience, and the fields closest to engineering sit under the Sustainable Lands impact area — natural resources and environmental policy, and urban and regional planning.

### Notes

- **The two existing USA records were checked for the restriction and are correct.** NSF GRFP already carries `eligibility.nationality: "U.S. citizens, nationals, or permanent residents"` and Fulbright already routes applicants to their home-country commission. A catalog that lists a citizen-restricted award without saying so is worse than one that omits it, and this pass confirmed that was not the case here.
- **Knight-Hennessy carries a real constraint worth stating: the first bachelor's degree must have been earned in January 2020 or later** for the 2027 cohort, extended by two years for military service. That is a genuine filter, not a footnote, and it is recorded in `eligibility.other` along with the excluded Stanford programmes (Honors Cooperative Program, Master of Liberal Arts, JSD, MLS, coterminal degrees).
- **Its funding does not cover a whole doctorate, and the record says so.** The fellowship runs up to three years; for a PhD the department funds the remaining years. "Fully funded" would have been the easy phrase and the wrong one.
- **Aga Khan Foundation International Scholarship Programme was examined and left out.** Its country list names Afghanistan, Bangladesh, India, Pakistan and others but **not Nepal**, and the page presents the list as examples rather than exhaustive. Nepal's absence is therefore suggestive, not conclusive — and an eligibility question that cannot be settled is not a basis for a record.
- **The ANSO-CAS-TWAS/UNESCO PhD Scholarship is a lead, not a record.** It funds up to 40 PhD students a year from developing countries in China, at CNY 6,000–7,000 a month with tuition and insurance waived, and "Engineering Sciences" is one of its ten fields. But the page consulted **does not name Nepal**, eligibility is delegated to TWAS's developing-country list, and the call it describes is closed. Worth a dedicated check rather than a guess.
- **The `Non-degree` track now holds three records across two countries** (the two New Zealand short-term schemes and Humphrey), and `docs/ROADMAP.md` Phase 1 now names it as its own line rather than leaving it buried in the degree-level list.
- The catalog now carries **seven verified closing dates**. Knight-Hennessy's is in the past — it closed the day before this pass — which is the point: a verified date that has passed still documents the cycle for the next one.
- Link probe: **70 checked, 0 dead**, all five new URLs returning `OK [200]`.

## [0.13.0] - 2026-10-07

### Fixed

**A `prefers-reduced-motion` guard — and the false claim that had been justifying it for three passes.**

The guard is small. Why it needed adding is not: since the ninth pass this item was carried as "a reduced-motion check — **the hero uses CSS animation** and there is no `prefers-reduced-motion` guard". That premise is false, and it had been repeated in `docs/PROGRESS.md`, `docs/ARCHITECTURE.md` and `docs/ROADMAP.md` without ever being measured. Measured now, in the running page:

| Claim | Measured |
|---|---|
| "the hero uses CSS animation" | **0 of 1,808 elements** report a computed `animation-name` other than `none` |
| `@keyframes` in the source | **0** — the string appears in neither `src/styles.css`, `src/main.jsx` nor `index.html` |
| `animation` property in the source | **0 occurrences** |
| The only motion present | a **0.2s `box-shadow, border` transition on 40 card surfaces** |

There was never an animation to suppress. What the guard actually does is cover the card hover transitions — real motion, worth respecting — and anything animated later. That is what the stylesheet now says, next to the measurement, so the next person does not inherit the same assumption.

### Added

- **A `prefers-reduced-motion: reduce` block**, using `.01ms` rather than `0s` so that `transitionend` still fires. **Verified by a reversible control rather than asserted:** with the media query emulated, perceptible transitions (duration > 50ms) fall from **40 to 0** and the maximum transition duration falls from **0.2s to 0.00001s**; resetting the emulation restores 40. The rule's presence in the CSSOM was confirmed *first*, because a guard that never made it into the stylesheet would pass the same test.

### Changed

- **Corrected the false animation claim** in `docs/PROGRESS.md`, `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`, and split the Phase 1 checkbox so the reduced-motion half is marked done. This is the second time this repository has carried a confident, unmeasured accessibility claim into its own documentation — the first was "dark mode is fixed" in 0.6.0, which survived four passes while light mode, the default, had never been measured at all. Both were written in exactly the same register as the claims that *had* been measured.
- **EESIC re-checked.** Its admission page still carries no closing date as of 2026-10-07; it says the 2027-2029 call "will be published on this section in **October 2026**", which is the current month. The record's `deadline_notes` now quotes that wording and records the recheck date, and the targeted-region list is transcribed with its region numbers (including Region 5 Asia) along with the caveat that the page does not enumerate the countries in each region.

### Notes

- **`agent-browser` media emulation is `set media`, not `media`** — `agent-browser set media reduced-motion`, and `set media light` resets it. **`set viewport <w> <h>` also works**, verified: 1280×577 → 1024×768. The ninth-pass note that the viewport command "is not actually available" was wrong about the *invocation*, not the capability — the same class of error as the animation claim.
- **The narrow-screen layout was checked while the viewport was open, and it holds.** At 390×844 there is no horizontal overflow (`scrollWidth` 390 = `innerWidth` 390), the sidebar collapses to a 64px icon rail, the filter selects stack, and cards render intact. The decorative `.hero-art` bleeds past the right edge as intended and is clipped by its panel. The roadmap's "no slide-out drawer below 850px" is a missing feature, not a broken layout.
- **The link probe's "unreachable" count is not reproducible, and the docs had quoted it as a fixed fact.** Sampled nine times, `npm run check:links` reported **6 unreachable in seven runs and 7 in two**; `HTTP 412` on `www.campuschina.org` appeared in every run and `HTTP 503` on `www.nzscholarships.govt.nz` in one. `65 checked, 0 dead` is the stable result and the only half worth quoting — the rest is network weather. This is the same error as the animation claim in miniature: a single measurement written up in the register of a fact.

## [0.12.0] - 2026-10-07

### Added

Three records, 37 → **40** and Europe 12 → **15**, which brings the region to the lower bound of the Phase 1 target of 15–25. One of the three closes the coverage gap flagged in 0.11.0: **Europe had no PhD-level entry at all, and now has one.**

- **Groundwater and Global Change — Impacts and Adaptation (GroundwatCH)** — IHE Delft (coordinator), TU Dresden and Instituto Superior Técnico, Universidade de Lisboa. **Civil engineering is named explicitly among the accepted first degrees**, alongside geologic, hydraulic, environmental and agricultural engineering. **Carries a real verified deadline: 3 January 2027** for Partner Country applicants, which includes Nepal. EUR 1,400 per month for 24 months plus all participation costs, about 15 scholarships a year across four intakes.
- **EMerald Master in Georesources Engineering** — Université de Liège (coordinator), Université de Lorraine, Luleå University of Technology and TU Bergakademie Freiberg. Erasmus Mundus and EIT RawMaterials labelled. **Verified deadline 28 February 2027** for the scholarship round, which opened 3 November 2026; outcomes 16 April 2027. The full grant is EUR 33,600.
- **Marie Skłodowska-Curie Actions Doctoral Networks (MSCA-DN)** — the European Union scheme that funds salaried PhD positions across international consortia. **This is the first Europe-located PhD record**, and it is the honest answer to "Europe offers nothing at doctorate level": the funding is real and open to any nationality, but it has no single deadline, because each funded project advertises its own vacancies continuously on EURAXESS.

### Notes

- **MSCA-DN does not fit the `deadline` field, and the record does not pretend it does.** Its `deadline` is `null` and the rolling-vacancy model is explained in `deadline_notes`, with `status: "open"` — the same treatment the three existing open-cycle records already use. Inventing a date would have been the easier and worse choice.
- **A mobility rule is recorded, not glossed over.** MSCA-DN candidates must not have lived or worked in the country of the recruiting organisation for more than 12 months in the previous 36 — a real constraint on the route, and the reason the record points at EURAXESS rather than at a single application page.
- **i-MESC was examined and left out.** It is a genuine energy-materials EMJM (batteries, supercaps, fuel cells) and a good thematic match for the catalog, but its admission criteria require a bachelor in chemistry, physics, chemical engineering, materials science or material process engineering, and its application page contradicts itself — one line says applications are open until 4 February, the next says the form is closed. Neither is a basis for a record.
- **EMerald's fit is recorded honestly rather than assumed.** Civil engineering is *not* on its list of accepted degrees; it qualifies only through the general "bachelor degree in engineering" route, and then only with basic knowledge of geology and at least 22.5 ECTS of university mathematics. That constraint is written into `eligibility.other`, so a civil-engineering applicant is not misled by the Erasmus Mundus label.
- **Groundwater and EMerald came out of the same EACEA catalogue pagination technique recorded in 0.11.0**, not from a new source. The method is now repeatable rather than lucky.
- The catalog now carries **six verified closing dates**: ETH Zurich ESOP (30 November 2026), TU Delft Justus & Louise van Effen (1 December 2026), **Flood Risk Management (3 January 2027)**, **Groundwater and Global Change (3 January 2027)**, KTH (15 January 2027) and **EMerald (28 February 2027)**.
- **Broader Europe reaches 15, the lower bound of the Phase 1 target**, and is the first region to do so. The remaining Phase 1 destinations still hold 2–4 each.
- Link probe: **65 links checked, 0 dead**, 7 unreachable from this machine — unchanged, and still a documented sandbox limitation rather than broken links. All six new URLs returned `OK [200]`.
- README screenshots were re-captured, because the previous pair showed the old count of 37 in the hero.

## [0.11.0] - 2026-10-07

### Added

Four Erasmus Mundus Joint Masters, 33 → **37 records** and Europe 8 → **12**. All four sit in civil, structural or materials engineering, and all were found through the official EACEA catalogue rather than an aggregator.

- **Flood Risk Management (FRM)** — IHE Delft (coordinator), TU Dresden, Universitat Politècnica de Catalunya and the University of Ljubljana. **Carries a real verified deadline: 3 January 2027** for applicants from Partner Countries, which includes Nepal; programme-country applicants are due 7 February 2027. EUR 1,400 per month for up to 24 months plus all participation costs. **Civil engineering is an explicitly accepted first degree.**
- **Risk Assessment and Management of Civil Infrastructures (NORISK)** — University of Minho, Universitat Politècnica de Catalunya, University of Padova and La Rochelle Université. EUR 1,400 per month with the EUR 9,000 participation cost fully covered, and up to seven scholarships a year reserved for Partner Country students.
- **Advanced Structural Analysis and Design using Composite Materials (FRP++)** — University of Minho, University of Girona, University of Naples Federico II and INSA Toulouse. Same funding structure; **Nepal appears explicitly on the programme's Partner Country and NDICI lists**, so the quota is read off the page rather than inferred.
- **Mechanics of Sustainable Materials and Structures (MS²)** — TU Dortmund, University of Trento and École Centrale de Nantes, awarding a multiple degree from all three.

### Notes

- **The catalogue holds 218 projects; these four came from a parsed list of 210.** The EACEA catalogue page renders 20 entries at a time and ignores its own search parameter, but it accepts `?page=N`, so paging through it yields the full set to screen by keyword. Two markup traps: the HTML breaks lines *inside* tags (`<span\n class="…"`), so any regex for a tag must tolerate whitespace, and a keyword screen over programme names returns 75 candidates, most of them irrelevant — it is only a first pass.
- **Scholarship availability was verified per programme, not inferred from catalogue membership.** The catalogue itself warns that some listed programmes no longer offer Erasmus Mundus scholarships, and one of them proved the point.
- **AMIR (Advanced Materials Innovative Recycling) was rejected on a verified ground.** Its fees page states plainly that "Erasmus Mundus full scholarships are not available for the next cohort" — only a EUR 15,000 EIT partial grant, which leaves the first six months unfunded. It is a strong programme, but it does not belong in a scholarship catalog on the strength of its EMJM label.
- **MBUILD was rejected** because its site returns an empty 89-byte page. **FRP++'s scholarships page is stale** — it still describes a "third edition in 2024/2025" while its applications page says fifth edition 2026/2027; the applications page was treated as authoritative.
- **NORISK and FRP++ have both closed their 2026 calls**, so neither carries a `deadline`; both use `deadline_notes` and are marked `verify`. Only Flood Risk Management has a live future date.
- The catalog now carries **four verified closing dates**, all within the next four months: ETH Zurich ESOP (30 November 2026), TU Delft Justus & Louise van Effen (1 December 2026), **Flood Risk Management (3 January 2027)** and KTH (15 January 2027).
- Link probe: **59 links checked, 0 dead**, 7 unreachable from this machine — a documented sandbox limitation, not broken links.

## [0.10.0] - 2026-10-07

### Fixed

**Accessibility — contrast, in both themes.** Every colour was measured by reading the real computed style in a running browser and computing the WCAG ratio against the *effective* background (walking up the ancestor chain past transparent layers), across all five views. Both themes were wrong, and the one nobody had ever measured was the worse of the two:

| Theme | Elements checked | Failing before |
|---|---|---|
| Light | 39 | **26** |
| Dark | 39 | 8 |

Light mode's worst offenders were `.footer span` at **2.35:1**, `.disclaimer` at 2.56:1 and `.workspace-label` at 2.68:1. Dark mode still had eight failures the 0.6.0 dark-mode fix never reached — `.details-link` at 2.77:1, `.outline-btn` at 2.39:1 and, most seriously, `.detail-grid b` at **2.18:1**, which is the deadline and amount text inside the detail dialog.

The replacements were computed, not chosen by eye: the hue is darkened on light surfaces and lightened on dark ones until the ratio clears 4.6:1. All 39 elements now pass in both themes, plus the dialog (48 elements). Three surfaces — `.welcome-spark`, `.coming-note`, `.detail-note` — kept a *light* background in dark mode and now get a dark one. `.deadline-chip`, the dated amber chip, already passed at 4.57:1 and was deliberately left alone.

### Added

- **Visible keyboard focus.** There was no focus style anywhere, and several base rules set `outline:0`, so a keyboard user had **no visible indicator on any control** (WCAG 2.4.7). A `:focus-visible` ring now covers links, buttons, inputs, selects and anything with a tabindex, with a lighter ring in dark mode.
- **A working `Ctrl`/`⌘ K` shortcut.** The search box has rendered a `⌘ K` hint since the first commit with nothing listening for it — a decorative control. It now focuses the search field, and the hint shows the correct key for the platform rather than always the Mac glyph.
- **A properly behaved dialog.** `role="dialog"`, `aria-modal` and the label were already correct, but focus stayed *behind* the dialog, 83 background controls remained tabbable, and **Escape did nothing**. Focus now moves into the dialog on open, Tab and Shift+Tab are trapped inside it, Escape closes it, and focus returns to the button that opened it.
- **Live regions**, so the app is no longer silent to a screen reader: the toast is `role="status"`, the result count is `aria-live="polite"`, and the assistant transcript is `role="log"`.
- **README screenshots**, in both themes.

### Notes

- **An accessible name was missing** on the assistant view's settings icon button — a screen reader announced only "button". Every other icon-only control already had one.
- **Decorative graphics are now hidden from assistive tech**: the hero illustration, the card flag tiles (the country is already in text) and the status dot.
- **Two surfaces that looked fine were not.** The light-mode sweep also caught `.deadline-chip.notes` (3.94:1) and the empty-state text (3.36:1), neither of which had ever been measured.
- **Why this survived every earlier pass:** the default theme is light, so every screenshot in every prior pass was light mode — and light mode had never been measured at all. The 0.6.0 dark-mode fix then created the impression that the theme work was finished.
- Still outstanding: a screen-reader pass with real assistive technology, and a reduced-motion check.

## [0.9.0] - 2026-10-07

### Added

Three records, 30 → **33**, filling the last destinations that held only a single entry each. **Every Phase 1 destination now holds at least two records.**

- **KTH Scholarship** (Sweden) — full tuition waiver for a one or two-year master's at KTH Royal Institute of Technology, covering both years subject to satisfactory first-year results. **Carries a real verified deadline: 15 January 2027** (applications open 1 December 2026), which makes it the third record with an actual closing date rather than a window.
- **Swiss Government Excellence Scholarships** (Switzerland) — CHF 2,450 per month for a 12-month research stay or a 36-month PhD, open to applicants from 183 countries. Maximum age 35, and the application must be backed by a supervisor in Switzerland.
- **Université Paris-Saclay International Master's Scholarship** (France) — EUR 10,000 per year plus up to EUR 900 towards travel and visa costs, in any academic field. Applicants must be under 30 and enrolling in France for the first time.

France, Switzerland and Sweden now hold 2 records each, so no Phase 1 destination is a single entry any more.

### Notes

- **The KTH deadline is the most concrete addition.** Its 2027 window (1 December 2026 to 15 January 2027) is the third real closing date in the catalog, alongside ETH Zurich ESOP (30 November 2026) and TU Delft Justus & Louise van Effen (1 December 2026). KTH excludes the Erasmus+ and EIT joint programmes and Computer Simulations for Science and Engineering — those fall under the separate KTH Joint Programme Scholarship — and applicants must list KTH as their first priority.
- **The Swiss scheme's deadline is set by country of origin**, published by the Swiss diplomatic representation handling the application, so the record carries `deadline_notes` and no single date. It also carries an age limit of 35 and requires a named Swiss supervisor; both are recorded as constraints rather than left implicit.
- **Paris-Saclay cannot be combined with Eiffel, France Excellence Europa or an Erasmus Mundus scholarship**, and applicants receiving other funding above EUR 600 per month are ineligible. Its published dates are for the 2026 cycle (applications closed 31 March 2026); equivalent 2027 dates were not yet published, so the record is `verify` with `deadline_notes`.
- **Two source URLs had moved and were re-found rather than trusted.** The first KTH URL tried and a Lund global-scholarship URL both returned 404; the live KTH page is `kth.se/en/studies/master/admissions/scholarships/kth-scholarship-1.72827`.
- Link probe: **50 links checked, 0 dead, 7 unreachable** from this machine — the unreachable set is a documented sandbox limitation, not broken links.

## [0.8.0] - 2026-10-07

### Added

Three records, 27 → **30**, filling out the destinations that had only a single entry each:

- **Justus & Louise van Effen Excellence Scholarship** (TU Delft, Netherlands) — full first-year tuition at the statutory or institutional rate plus a contribution to living expenses; two awards per faculty. **Carries a real verified deadline: 1 December 2026, 23:59 CET**, which makes it the second record in the catalog with an actual closing date rather than a window.
- **Gates Cambridge Scholarship** (United Kingdom) — full-cost, around 70 awards a year, roughly two-thirds to PhD students, in any subject Cambridge offers. Open to citizens of any country outside the UK.
- **DAAD EPOS** (Germany) — DAAD's development-related postgraduate courses, EUR 992 per month for master's candidates plus health, accident and liability insurance and a travel allowance.

Netherlands, Germany and the United Kingdom now hold 2 records each.

### Notes

- **DAAD EPOS requires two years of professional experience** after the bachelor's degree, and degrees should normally be no more than six years old. It joins JJ/WBGSP (three years) as a programme with an experience gate, so the constraint is recorded in the catalog rather than discovered after preparing an application.
- **Nepal's eligibility was verified, not assumed.** The DAAD country-list PDF could not be retrieved — `static.daad.de` is unreachable from this machine — so eligibility was confirmed against the OECD DAC List of ODA Recipients, the list DAAD draws on. Nepal appears there as a Least Developed Country (lower-middle income).
- **TU Delft excludes International Joint Education Programmes**, so the Justus & Louise van Effen scholarship cannot be combined with an Erasmus Mundus master's. It also forbids holding any other partial or full scholarship at the same time.
- **Gates Cambridge funds one-year postgraduate courses and the PhD, not two-year master's degrees**, and excludes MASt courses, part-time degrees other than the PhD, and professional degrees such as the MBA, EMBA and MFin. Its deadline is the course-specific Cambridge funding deadline, which it does not publish as a single date.
- Link probe: **47 unique links, 0 dead.** Three DAAD URLs are unreachable from this machine — a documented sandbox limitation, not a broken link — and were confirmed live through a different fetch path.

## [0.7.0] - 2026-10-07

### Added

Three Erasmus Mundus Joint Masters, taking the catalog from 24 to **27 records** and Europe to **8** — now the deepest destination, ahead of China and New Zealand on 4.

- **EESIC** — Engineering for Environmental Sustainability and International Cooperation. Instituto Superior Técnico (Lisbon), Universitat Politècnica de València, University of Trento: one semester at each, then a fourth semester of project work and thesis with an associated partner. **The call for the 2027-2029 cohort opens in October 2026** — the only record in the catalog whose next application window is opening now.
- **REM+ 2** — Renewable Energy in the Marine Environment, covering wave, tidal and gradient energy systems. University of the Basque Country, University College Cork, Politecnico di Torino, École Centrale de Nantes.
- **MaMaSELF+** — Materials Science, across six universities in France, Germany, Italy and Poland.

### Notes

- **MaMaSELF excludes civil engineering.** Its admission page states that bachelor's degrees in Mechanical Engineering and Mechatronics "are not adapted to the Mamaself program", and that applicants from civil engineering, medicine or pharmacy "will not be accepted unless they have a good background in Chemistry or Physics". This is recorded in `eligibility.other` rather than glossed over: the record is in scope for materials-science students, but a civil engineer needs chemistry or physics at bachelor's level.
- **EESIC reserves some scholarships for targeted regions, including Asia.** Its admission page lists nine targeted regions; the EU's "Region 5 Asia" grouping covers South Asia, so an applicant from Nepal may fall inside a reserved quota. The country list was not published on the pages checked, so this is recorded as a possibility, not a promise.
- **REM+ 2's admission page is a placeholder.** It was replaced by a notice dated 16 September 2026 stating that the selection and admission procedure is "under review by the Joint Programme Board". The record is `verify`, and its `eligibility.other` says plainly that the accepted fields could not be verified — the alternative was to guess them.
- **None of the three publishes a 2027 deadline yet**, so all three use `deadline_notes` instead of a fabricated `deadline`. MaMaSELF's most recent dates were 13 February, 20 March and 15 May 2026; REM+ 2's 2026 edition is closed with news of the 2027 edition pending.
- Link probe: **41 unique links, 0 dead.** All eight new URLs return 200.

## [0.6.0] - 2026-10-07

### Fixed

**Dark-mode contrast.** Several elements set hardcoded light surfaces with no dark counterpart, so they rendered as bright patches on a dark card — and the hero's stat numbers were effectively invisible. Measured by reading the real computed styles in a running browser and computing the WCAG ratio, not by eye:

| Element | Before | After |
|---|---|---|
| Hero stat number (`24`, `12`, `Free`) | **1.39:1** | 10.75:1 |
| Hero eyebrow | 2.82:1 | 7.25:1 |
| Hero copy | 3.00:1 | 6.04:1 |
| Hero stat label | 3.41:1 | 5.61:1 |
| Chip / field chip | — | 5.94:1 |
| Status badge | — | 5.75:1 |
| Match ring | — | 6.84:1 |

Everything now meets WCAG AA (4.5:1). The affected elements were `.hero-stats strong`, `.hero-stats span`, `.hero-copy`, `.eyebrow`, `.welcome h1 em`, `.stat-divider`, `.chip`, `.field-chip`, `.status-badge`, `.status-open/closed/upcoming`, `.match-ring` and `.card-icon`. `.deadline-chip` was the only one that already had a dark override.

### Notes

- The roadmap's own known issue — "chips and status badges use hardcoded light colours with no dark-mode override" — was accurate but incomplete. The hero panel had the same defect and it was the worst instance, at 1.39:1, which is below the threshold at which text is legible at all.
- Only dark mode was wrong. Light mode was never affected, which is why this survived a build, a test run and several browser passes: the default theme is light.

## [0.5.0] - 2026-10-07

### Added

- **`Non-degree` value in the `degree_level` enum.** Funded short courses, cohort training and professional fellowships award a certificate rather than a degree, and previously had no honest way to be recorded. The enum is declared once in `scripts/validate-catalog.mjs` and mirrored in `src/main.jsx`; the validator now rejects any `degree_level` value outside it.
- **Manaaki New Zealand Thematic Short Term Cohort Training Scholarships** — two-to-four-week cohort courses, in New Zealand or online. The funded *Climate Change and Resilience* theme includes Renewable Energy Project Management.
- **Manaaki New Zealand Vocational Short Term Training Scholarships** — one week to 12 months, as a training course, a work placement, or an online or in-country course, with renewable energy among the funded themes.

The catalog now holds **24 records** across 12 destinations.

### Changed

- **The field and degree filters are now derived from the catalog** instead of hardcoded, fixing the same class of defect as the earlier "5 regions" hero stat. The filter offers only the levels the catalog can actually return; the profile goal selector deliberately keeps the full enum, because a goal may legitimately exceed current coverage (`PostDoc` has no record yet).
- `nz-scholarships` description narrowed to undergraduate and postgraduate study. It previously claimed the programme "covers undergraduate and postgraduate study plus thematic and vocational short-term training", which now double-counted the two short-term schemes recorded separately.
- The thematic short-term description now names Renewable Energy Project Management explicitly, so the `Renewable Energy` field label is grounded in the source rather than inferred from the scheme's title. Seven of that scheme's eight courses are governance, public health, trade, diplomacy or agribusiness.

### Notes

- **Nepal is not eligible for any of the three Manaaki short-term schemes.** Thematic training is open to Pacific, ASEAN, African and Latin American and Caribbean countries; the vocational scheme is open to Pacific countries and territories only. Both exclusions are recorded in the relevant `eligibility.nationality` field, so the constraint is visible before any preparation begins.
- **English Language Training for Officials excluded** — a real Manaaki short-term scheme, but language training rather than an engineering field, so it falls outside the catalog's declared scope.
- Link probe: **33 unique links, 0 dead.** Five remain unreachable from this machine (sandbox DNS and connect timeouts) and are reported as unverified rather than broken.

## [0.4.0] - 2026-10-07

### Added

Three records, taking the catalog from 19 to 22 and giving China four entries, the joint-most with broader Europe:

- **JJ/WBGSP** — Joint Japan/World Bank Graduate Scholarship Program. Open to developing-country nationals, with infrastructure management named as one of its key development areas. Study is at 44 participating master's programmes across 24 universities in the U.S., Europe, Africa, Oceania and Japan.
- **Tongji University scholarships for international students** — Chinese Government Scholarship streams (Bilateral, Silk Road, High Level Postgraduate), the Shanghai Municipal Government Scholarship, and university-specific awards.
- **HIT International Students Scholarship** — Harbin Institute of Technology; a tuition-fee waiver only, awarded in tiers of 100%, 50%, 30% or 20%, with no living stipend.

### Changed

- `country` now accepts **"Multiple countries"**, used by JJ/WBGSP because its participating programmes span five continents. Labelling it "United States" would have implied study in the US, which the programme does not guarantee.

### Notes

- **Hubert H. Humphrey Fellowship excluded:** it is explicitly a *non-degree* programme, and the `degree_level` enum covers only Bachelor/Master/PhD/PostDoc. Adding it needs a schema change, not a data change.
- **CAS-TWAS President's Fellowship excluded:** the official UCAS page still displays the **2017** call (age limit "on 31 December 2017", deadline "31 MARCH 2017"). A nine-year-stale page is not a valid `source_url`.
- USA coverage grows more slowly than China or Europe because most US graduate funding is restricted to US citizens or permanent residents. JJ/WBGSP is one of the few routes that sends developing-country nationals to US universities.

## [0.3.0] - 2026-10-07

### Added

Five records, taking the catalog from 14 to 19 and adding Sweden, which had no coverage despite being named in the Phase 1 scope:

- **RESCO** — Erasmus Mundus Joint Master in Renewable Energy and Sustainable Construction (Hungary, Spain, Portugal, France).
- **TERRA** — European Master in Earthen Architecture and Construction (Portugal, Spain, France, Italy); first edition in the 2026/2027 academic year.
- **BIOPHAM** — Erasmus Mundus Joint Master in Bio & Pharmaceutical Materials Science.
- **TFMASA** — International Master in Transfers-Fluids-Materials for Aeronautics Sustainable Applications (France, Belgium, Germany).
- **SI Scholarship for Global Professionals** — Swedish Institute; fully funded, restricted to 34 listed countries.

Each carries a `source_url` and a `last_verified` date, plus `deadline_notes` where the cycle has no single closing date.

### Changed

- Card chips now distinguish a verified closing date from "Dates in detail", so a record with window or field-split dates is visible without implying one deadline.
- Added the Sweden flag to the destination icons.

### Notes

- One candidate was deliberately **excluded**: Erasmus Mundus STEPS (Sustainable Transportation and Electric Power Systems) describes itself as "a highly specialized education in Electrical Engineering". Adding it would have meant mislabelling it as Civil Engineering or Materials Science, which the data rules forbid.

## [0.2.0] - 2026-10-07

### Added

- `deadline_notes` schema field, for cycles that have no single closing date (an application window, field-split deadlines, or a country-specific rule).
- `npm run check:links` — a link-liveness probe over every `official_url`, `application_url`, and `source_url`. It fails the run on a `404`/`410`; `401`/`403`/`405`/`429` are reported as **blocked** rather than dead, because many government and university sites refuse automated requests.
- Deadline and "source last checked" rendering in both the card and the detail dialog, with an explicit "not maintained" fallback when no date is recorded.
- `--catalog=<path>` option on the validator, so the checks can be exercised against fixtures.

### Changed

- All 14 catalog records now carry a `source_url` and a `last_verified` date. Catalog warnings fell from 40 to 5.
- Award amounts and benefit lists refreshed from the official pages (NSF GRFP, Eiffel, NL Scholarship, ETH ESOP, Australia Awards, Melbourne Graduate Research).
- Statuses set from verified pages where the cycle state is unambiguous (Chevening, ETH ESOP, Melbourne, NSF GRFP).
- The hero destination count is derived from the catalog instead of hardcoded.
- Validator now rejects a record whose `deadline` has no `last_verified`, or whose `deadline` sits behind `status: "verify"`.

### Fixed

- Two dead official links: the Tsinghua financial-aid page and the University of Canterbury first-year scholarship page both returned `404`. Both now point at the current pages.
- The offline assistant guide printed the user's question twice.
- Removed the mobile menu button, which was `display:none` in every media query and therefore did nothing.

## [0.1.0] - 2026-09-25

- Initial static ScholarHub app: discovery filters, details, local profile, shortlist, dark mode, and offline assistant guide.
- Added 14 starter scholarship discovery records with official program links.
- Added data/contribution and architecture documentation.
- Clearly documented incomplete country coverage and unimplemented AI/provider features.
