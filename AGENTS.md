# AGENTS.md — ScholarHub

Repository-level guidance for agents and contributors working inside `scholarhub/`.

## Project identity

ScholarHub is a static, client-side scholarship discovery application. There is no server, no database, and no authentication. All personalization (profile, shortlist, theme) lives in browser localStorage. The canonical data source is `data/scholarships.json`.

## Scope discipline

- **NOW** — features required by the current milestone (see `docs/ROADMAP.md`).
- **SEAM** — cheap contracts protecting known future changes (e.g., provider adapter interface).
- **LATER** — documented but not implemented.
- **OUT OF SCOPE** — backend servers, authentication, paid services, cloud databases, analytics pipelines. Do not add dependencies that assume these exist.

## Governance precedence

1. User instructions (highest)
2. This file (`AGENTS.md`)
3. `docs/` documentation
4. Implementation details (lowest)

## Development commands

```sh
npm install          # install dependencies (uses .npm-cache locally if needed)
npm run dev          # start Vite dev server
npm test             # the canonical gate: node --test, catalog validation, requirements validation, then the render smoke test
npm run test:render  # just the render smoke test (every view, empty + populated browser)
npm run check:links  # catalog validation plus a liveness probe of every official link (needs network)
npm run build        # production build to dist/
npm run preview      # preview production build
node scripts/validate-catalog.mjs  # standalone catalog validation
node scripts/validate-catalog.mjs --links --catalog=<path>  # validate a fixture catalog
node scripts/validate-requirements.mjs  # standalone requirements validation
node scripts/validate-requirements.mjs --requirements=<path> --catalog=<path>  # validate a fixture pair
```

**`npm test` is the canonical gate, and it is a chain.** Run it whole, not the
parts you feel like. `.github/workflows/ci.yml` invokes exactly this command, so
anything added to the chain is automatically covered on every pull request — and
anything you skip locally is still enforced remotely.

There is no TypeScript and no linting config beyond `actionlint` for the
workflow file. Keep it simple.

## Data rules

- Every scholarship record must have a stable kebab-case `id`, an `official_url` starting with `https://`, and a `status` of `open`, `closed`, `upcoming`, or `verify`.
- Never invent deadlines, award amounts, or eligibility criteria. Use `null` for unknown values and `"verify"` status when the current cycle is unconfirmed.
- Set `deadline` only when the official page publishes a **single** closing date. `last_verified` is then required, and `status` must not be `verify` (the validator enforces both). Use `deadline_notes` for an application window, field-split deadlines, or a country-specific rule.
- `source_url` must be a page a human actually opened. Never add a URL you have not read.
- Run `npm run check:links` before proposing data changes. A `404` on an official link is a blocking defect. `401`/`403`/`405`/`429` means **unverified, not broken** — many government and university sites refuse automated requests.
- Official sources take precedence over this repository. Link them directly.
- Records are human-reviewed proposals. AI-generated content is not canonical until a human commits it.

**Requirements are a separate file, and a separate honesty rule.** `data/requirements.json` holds the machine-comparable form of a requirement, keyed by record id, and is validated against `docs/REQUIREMENTS-SCHEMA.md` by `scripts/validate-requirements.mjs`.

- **A requirement carries a `kind`, and the `kind` is the point.** `none-stated` ("the provider states there is no threshold") and `unstated` ("the catalog has not looked") are **opposite claims** and must never collapse into one shape. A rule that has more than one figure (`branches`), or none that a single number can hold (`prose`), is recorded as such rather than reduced to a number — **reducing it would be inventing one.**
- **`source` and `last_verified` are mandatory on every requirement.** A requirement is the thing that goes stale fastest: providers change a threshold without changing the page, so there is no diff to notice. An unsourced requirement is an assertion, not a record.
- **A numeric requirement must carry its `scale`.** `3.0` means four different things on `/4.0`, `/4.3`, `/4.5` and `/5.0`. The comparison engine refuses to assume one, and so does the validator.
- **Context is not a requirement.** `kaust-fellowship` prints "typically 90% of admitted applicants have a GPA above 3.3" — that is a description of who was admitted, not a threshold, and comparing against it would be a defect. Put it in `text` or `not_a_requirement`, never in `minimum`.

## File boundaries

| Path | Purpose |
|------|---------|
| `src/App.jsx` | The React application (all views, state, filtering). Deliberately free of mount-time DOM access so it can be rendered outside a browser. |
| `src/main.jsx` | Entry point. Imports `App` and mounts it. Keep it to this and nothing else. |
| `src/styles.css` | All styling including dark mode |
| `src/countries.js` | Flag and destination helpers, derived from `data/countries.json` |
| `src/eligibility.js` | Per-country eligibility verdict (pure, unit-tested) |
| `src/tracker.js` | Deadline countdowns and the document checklist (pure, unit-tested) |
| `src/providers.js` | Provider registry + the sourced frontier model seed (pure, unit-tested) |
| `src/chat.js` | The provider adapter: request shapes, replies, model discovery, errors (pure, unit-tested) |
| `src/useAi.js` | AI connection state and the network calls (the only AI module that touches `fetch`) |
| `src/assistant.js` | What the assistant may send and may claim: the per-question profile gate, the assessor guard, and the egress disclosure (pure, unit-tested). Never lazily loaded — a decision about what leaves the browser should not be code the reader has to trigger. |
| `src/AiSettings.jsx` | The AI settings view. Lazily loaded; the smoke test renders it directly. |
| `src/ingest.js` | Reading the reader's documents: a zero-dependency DOCX/ZIP reader, the deterministic extractor, and the refusal paths (pure, unit-tested). Lazily loaded. |
| `src/compare.js` | The three-valued requirement comparison — `meets` / `fails` / `unknown`, with `unknown` as the default (pure, unit-tested). |
| `src/IngestPanel.jsx` | The document-reading surface on the profile page. Lazily loaded; the smoke test renders it directly. |
| `data/scholarships.json` | Canonical scholarship catalog |
| `data/scholarships.test.js` | Catalog validation tests |
| `data/requirements.json` | Machine-comparable requirements, keyed by record id — 20 of 50 records as of v0.33.0; the sourcing pass is in progress, not finished |
| `scripts/validate-catalog.mjs` | Standalone validation script |
| `scripts/validate-requirements.mjs` | Validates `data/requirements.json` against `docs/REQUIREMENTS-SCHEMA.md` |
| `scripts/render-smoke.mjs` | Renders every view (empty + populated) to catch runtime errors |
| `docs/` | Architecture, schema, API notes, roadmap |
| `.github/` | Issue templates, PR template, and `workflows/ci.yml` |

**Keep decision logic in the pure modules, not in the component.** `eligibility.js`, `tracker.js`, `ingest.js`, `compare.js` and `assistant.js` exist so that the parts most likely to be subtly wrong — nationality rules, date arithmetic, whether a document actually yielded a value, and what a request is allowed to carry — can be unit-tested offline. Anything a test could pin down belongs there.

**Document reading: a refusal is a result.** `readDocument` never returns a blank document. An unreadable file, a scanned PDF, a binary named `.txt` and an empty extraction each produce an explicit outcome with a reason, because a blank profile reads as "this applicant has no GPA" — a different and false claim. Likewise `compareGpa` never defaults to `meets`: its default is `unknown`, and *"the provider states there is no threshold"* must never share a sentence with *"the catalog does not record one"*. Both rules are enforced by negative-control tests, and a test that only asserts a value is *absent* is not enough — it can pass with the guard removed.

**Never add mount-time DOM access to `src/App.jsx`.** A module-level `createRoot(document.getElementById('root'))` is what made the component unloadable anywhere but a browser, and that is exactly why a `ReferenceError` in one view shipped undetected for six versions. `scripts/render-smoke.mjs` renders all six views against both an empty and a populated browser; `npm test` runs it. Note that `node --test` still reads only the catalog and the pure modules, and a successful build still proves only that an identifier is *referenced* — the render smoke test is the only thing that executes a view's branches.

Do not create new top-level directories without documenting the reason. Country subdirectories under `data/scholarships/` are reserved for a future split-loader; the current app reads only the flat JSON file.

## Branch and merge policy

**`main` is protected. Every change goes through a pull request — no exceptions, including for a one-line data edit or a state-only commit.**

1. Branch off `main`: `git checkout -b <type>/<slug>` (e.g. `data/add-kenya-record`, `fix/deadline-parsing`).
2. Commit on the branch using Conventional Commits.
3. Push the **branch**: `git push -u origin <branch>`.
4. Open a PR, then merge it.
5. Delete the branch after merge.

Direct pushes to `main` are rejected, and **the rejection names the rule that fired**. A rule protecting `main` is now enforced in two places: classic branch protection (`enforce_admins` enabled, so it applies to administrators too) and an active **ruleset** (`main-protection`, `bypass_actors: []`, `current_user_can_bypass: "never"`). Both apply as a *union* — a ruleset does not override classic protection, it adds to it.

Never force-push or rewrite history on `main`. Never delete or bypass the protection to land a change; if a change genuinely cannot go through a PR, that is a signal the change needs rethinking, not that the rule needs an exception.

## Verification

Four layers, and only the last two are authoritative:

1. **Nothing at commit time.** This repository has no git hooks — `core.hooksPath` is unset and `.git/hooks` holds only the sample files. Nothing stops a commit locally.
2. **Local gate (fast, bypassable).** `npm test` and `npm run build`, roughly a second together. Bypassable by simply not typing them, which is why they cannot be the last line of defence.
3. **Remote CI.** `.github/workflows/ci.yml` runs `npm ci`, `npm test`, `npm run build` and a build-artifact assertion on every pull request and every push to `main`. It invokes the same canonical command as layer 2, deliberately — a CI job with its own private check list drifts from what a developer can reproduce.
4. **The merge gate (authoritative).** The `verify` check is a **required status check**, with `strict_required_status_checks_policy` on, so a PR cannot merge while it is red *or* while the branch is behind `main`. Verified by attempting a direct push and reading the rejection: `Required status check "verify" is expected`.

**The context name is exactly `verify`** — the *job's* `name:` in the workflow, not the workflow's `name:`. If the job is ever renamed, the ruleset must be updated in the same change or the gate waits forever for a check that no longer reports.

**Watch the interaction with Dependabot.** `strict_required_status_checks_policy: true` means any merge into `main` invalidates other open PRs until CI re-runs. That is correct for a multi-person repo and mildly annoying for a solo one with bot PRs open. It can be relaxed per-repo without touching the required check itself.

## Commit conventions

Use Conventional Commits: `feat:`, `fix:`, `data:`, `docs:`, `test:`, `chore:`. One logical change per commit.

## AI provider policy

The provider seam is **implemented as of v0.26.0**, and what a request may *carry* was constrained in v0.31.0. `src/providers.js` is the registry, `src/chat.js` is the adapter, `src/useAi.js` is the state, `src/assistant.js` decides what may be sent and claimed, and `src/AiSettings.jsx` is the UI. There is still no ScholarHub server, and there must not be one.

Rules that hold for any change to this area:

- **Keys never reach a server owned by this project.** There is no such server. A key is used in the page to sign a request that goes directly to the provider the reader selected. It must never be written into a request *body*, a log line, a notice, or an error message.
- **A key is session-only unless the reader opts in.** The default is React state, forgotten on reload. The opt-in writes it to `localStorage` under `sh-ai-key`, and the UI must say plainly that anyone using that browser profile can read it.
- **Never state that a connection works.** The only acceptable evidence is a reply that actually came back. `Test connection` makes a real call for exactly this reason.
- **Never claim a security property.** Say where a request goes, not that it is safe. `egressSummary()` is written to name a host and nothing more, and a test enforces that it contains no word like "secure" or "private".
- **Say what a request carries, not only where it goes.** Naming the host was never the whole picture. `egressSummary()` takes the profile and states both halves in one line, and the assistant puts the disclosure on the reply itself. The two claims are different and both are now made.
- **The profile is opt-in per question, not per session.** `needsProfile()` decides from the reader's wording whether the three facts may be attached, and it defaults to *no*. Never reintroduce an unconditional reader clause — that was the v0.26.0–v0.30.0 defect, and `src/assistant.test.js` now fails on it.
- **Do not assert a model roster.** Model ids, context windows and prices change monthly. Every provider that publishes a list endpoint is queried at runtime and that answer wins. `FRONTIER_SEED` exists only so the picker is not empty before a key is entered; each entry carries its source URL and the date it was read, and anything the source did not publish is `null`. Do not fill a `null` in with a plausible number.
- **Do not pretend a browser can do something it cannot.** Antigravity is the worked example: it authenticates through a local CLI session that no web page can reach. `agyRefusal()` returns the honest explanation plus the two routes that do work, and the UI shows it instead of a login form that could never succeed.
- **Never treat model output as scholarship data.** The assistant's prompt carries the catalog rows and forbids inventing a deadline, amount or eligibility rule; a model answer is labelled as one in the transcript.
- **A stream is a fallible iterator.** Do not write code that assumes a streamed reply arrives cleanly: an error frame can land mid-stream, and a chunk boundary can split a line. Surface the error, keep the text received before it, and carry the partial line into the next read. A stream that yields no text is a **failure**, not an empty answer — fall back rather than reporting a blank reply.
- **Never invent a cost.** `estimateCost` returns `null` when the model has no published price or no usage was reported, and the interface must say *uncosted* rather than showing `$0.00`. A cost known in only one direction is `partial` and must be labelled as such. A streamed reply reports usage in pieces, so merge them — taking the last report silently halves the figure.
- **Fallback must be disclosed.** If a second model answers, the reply says which one, and that the first failed. Do not swap models silently.

## Privacy

Personal state lives in localStorage under `sh-profile` (study goals, country of origin), `sh-saved` (shortlist ids), `sh-tracker` (tracked applications and their status), `sh-docs` (document checklist) and `sh-dark` (theme). Anything new that stores personal state belongs in the same place and is read back defensively. Users on shared devices should clear storage after use.

**"No PII leaves the browser" was the rule until v0.31.0, and it was false.** The
AI assistant attached the reader's profile — field, degree, nationality — to
*every* chat request, because the system prompt named the reader unconditionally.
The rule was stated in this file and enforced nowhere. Naming the destination in
`egressSummary()` is a statement about *where* a request goes; it is not a
statement about *what* the request carries, and only the first was tested. A
privacy claim held by a comment is a claim that will drift.

The rule is now an enforced predicate, and it is deliberately narrow:

- **A request carries the profile only when the question is about the reader.**
  `needsProfile()` in `src/assistant.js` decides, from the reader's own words.
  "What is the MEXT deadline?" sends catalog rows and nothing about the reader.
  "Am I eligible?" may carry field, degree and nationality. The default is
  **not to send** — a missed cue costs one rephrased question, a false positive
  sends a nationality to a cloud provider, and those failures are not symmetric.
- **What was attached is disclosed in the transcript**, per reply, by
  `egressDisclosure()` — not just in a settings panel the reader may never open.
- **`null` means "not sent" and must never become an empty string.** An
  interpolated `null` renders visibly broken; an omitted sentence reads as "not
  given", which is a different and false claim.
- **Which fields may be sent is a decision, not an accident.** Adding a field to
  the profile does not add it to the prompt. `readerClause()` names the three it
  is allowed to send, and a change to that list is a change to this policy.
- **The assistant is not an assessor.** `ASSESSOR_GUARD` forbids a verdict. The
  catalog records **zero** numeric GPA thresholds across all fifty records, so a
  model asked "am I eligible?" has nothing to reason from and will produce
  confident prose over an empty table — the exact failure `compare.js` refuses
  in its own domain. Do not answer that question with a model.
- Tests for both rules are negative controls: they assert the profile is
  **absent** from a programme question, and each was verified to fail against a
  planted unconditional send before being trusted. See `src/assistant.test.js`.

