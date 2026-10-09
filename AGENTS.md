# AGENTS.md — ScholarHub

Repository-level guidance for agents and contributors working inside `scholarhub/`.

## Project identity

ScholarHub is a static, client-side scholarship discovery application.

**If you are picking this up cold, read `docs/CONTINUATION.md` first.** It records what is in progress, the exact next steps, and the design decisions worth preserving — including the ones that cost something to learn. There is no server, no database, and no authentication. All personalization (profile, shortlist, theme) lives in browser localStorage. The canonical data source is `data/scholarships.json`.

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
npm test             # the canonical gate: lint, tests with coverage floors, catalog validation, requirements validation, then the render smoke test
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
| `src/compare.js` | The three-valued requirement comparison — `meets` / `fails` / `unknown`, with `unknown` as the default (pure, unit-tested). Reads `data/requirements.json` when an index is passed and falls back to the catalog scalar when not. |
| `src/requirements.js` | Maps one requirement from `data/requirements.json` onto the shape `compare.js` consumes (pure, unit-tested). Does no I/O: the dynamic `import()` of the JSON lives in `IngestPanel.jsx`, so this module stays runnable under `node --test`. |
| `src/IngestPanel.jsx` | The document-reading surface on the profile page. Lazily loaded; the smoke test renders it directly. |
| `data/scholarships.json` | Canonical scholarship catalog |
| `data/scholarships.test.js` | Catalog validation tests |
| `data/requirements.json` | Machine-comparable requirements, keyed by record id — 44 of 50 records as of v0.41.0, **and read by the app since v0.37.0**. 42 kB, so it is a lazy chunk and must stay one: a dynamic `import()` in `IngestPanel.jsx`, gated on a confirmed GPA. |
| `scripts/validate-catalog.mjs` | Standalone validation script |
| `scripts/validate-requirements.mjs` | Validates `data/requirements.json` against `docs/REQUIREMENTS-SCHEMA.md` |
| `scripts/render-smoke.mjs` | Renders every view (empty + populated) to catch runtime errors |
| `docs/` | Architecture, schema, API notes, roadmap |
| `.github/` | Issue templates, PR template, and `workflows/ci.yml` |

**Keep decision logic in the pure modules, not in the component.** `eligibility.js`, `tracker.js`, `ingest.js`, `compare.js`, `requirements.js` and `assistant.js` exist so that the parts most likely to be subtly wrong — nationality rules, date arithmetic, whether a document actually yielded a value, and what a request is allowed to carry — can be unit-tested offline. Anything a test could pin down belongs there.

**Document reading: a refusal is a result.** `readDocument` never returns a blank document. An unreadable file, a scanned PDF, a binary named `.txt` and an empty extraction each produce an explicit outcome with a reason, because a blank profile reads as "this applicant has no GPA" — a different and false claim. Likewise `compareGpa` never defaults to `meets`: its default is `unknown`, and *"the provider states there is no threshold"* must never share a sentence with *"the catalog does not record one"*. Both rules are enforced by negative-control tests, and a test that only asserts a value is *absent* is not enough — it can pass with the guard removed.

**Never add mount-time DOM access to `src/App.jsx`.** A module-level `createRoot(document.getElementById('root'))` is what made the component unloadable anywhere but a browser, and that is exactly why a `ReferenceError` in one view shipped undetected for six versions. `scripts/render-smoke.mjs` renders all six views against both an empty and a populated browser; `npm test` runs it. Note that `node --test` still reads only the catalog and the pure modules, and a successful build still proves only that an identifier is *referenced* — the render smoke test is the only thing that executes a view's branches.

**Node's test runner refuses `.jsx` outright** — `ERR_UNKNOWN_FILE_EXTENSION`, on the extension
itself. That is why **no component in this repository has a unit test**, and why `App.jsx`,
`AiSettings.jsx` and `IngestPanel.jsx` are covered only by the render smoke test. It is a hard
constraint, not an oversight, and it has a design consequence: **put the parts worth testing in a
plain `.js` module and let the `.jsx` only arrange them.** `errorBoundary.js` holds the fallback
copy and `ErrorBoundary.jsx` lays it out, for exactly this reason — the words a reader sees when
the app breaks are the part that can be confidently wrong, and they need to be testable.

**A render smoke test cannot test an error boundary either.** `renderToStaticMarkup` is the legacy
synchronous renderer and does not route render errors to a boundary — the error propagates out of
the call. The catch itself is a client-renderer question, so it is verified in a browser by hand,
and the fallback's content is smoke-tested by forcing the state. **A boundary is not a `try` around
an expression:** JSX children are evaluated eagerly during the parent's render, so a throw written
inline in the boundary's own JSX happens *above* it. React catches errors in **descendants**, which
is why the probe has to be a component.

**Coverage floors gate, and the ratchet only goes up.** `npm run test:cov` carries
`--test-coverage-lines=92 --test-coverage-branches=82 --test-coverage-functions=92`, and Node exits
non-zero when a floor is missed. The floors sit a few points below actual on purpose: a floor at the
current number fails on every new uncovered line, which teaches people to ignore it. **Raise the
floor, never lower it**, and keep it defined in one place — the `test` chain calls `test:cov` rather
than repeating the numbers.

**Coverage must be scoped to this repository, or it measures the machine.** The first version of
`test:cov` reported **84.55%** locally and **95.59%** on CI, because this development environment
injects two shim files into every Node process (`node-language-shim.cjs`, `node-safe-delete-shim.cjs`
— the delete guard) and they are counted at 43%. `--test-coverage-include='src/**'` (plus `scripts`
and `data`) is therefore **load-bearing, not cosmetic**. Before trusting any local measurement, ask
what else the environment put in the process — the same question as the timezone bug in v0.41.0.

**A file listing is not a coverage measurement.** I concluded that `src/compare.js` "had no tests"
because `ls src/*.test.js` showed no `compare.test.js` — while `src/ingest.test.js` already carried
26 references on it, including the two distinctions that module exists to make. The false claim
reached a commit message, a CHANGELOG entry and a pull request before the pre-existing test failed
and exposed it. **Count the references (`grep -c 'compareGpa\|compareAllGpa' src/*.test.js`), not
the filenames**, and never state that something is untested without searching for the thing itself
rather than for its expected location.

**A sentence is part of the answer, and needs its own test.** 18 of 36 records rendered "states its
requirement in a form that has more than one scale or branch" — false about every one of them —
while every test passed, because the tests asserted *reason codes* and the reason code was right.
Where a verdict has reader-facing copy, assert the copy: at minimum that it does not contain a
claim the record contradicts.

**A render smoke test cannot cover a dynamic import.** `renderToStaticMarkup` is synchronous, so a `useEffect` that lazy-loads a chunk never runs under it — the panel renders against the *fallback* path and looks healthy either way. The wiring in `IngestPanel.jsx` was therefore verified against a real dev server with `agent-browser`, on both render sites. **Anything reached only through a lazy `import()` needs a browser check, not a smoke render**, and that gap is real for `data/requirements.json`.

Do not create new top-level directories without documenting the reason. Country subdirectories under `data/scholarships/` are reserved for a future split-loader; the current app reads only the flat JSON file.

## Branch and merge policy

**`main` is protected. Every change goes through a pull request — no exceptions, including for a one-line data edit or a state-only commit.**

1. Branch off `main`: `git checkout -b <type>/<slug>` (e.g. `data/add-kenya-record`, `fix/deadline-parsing`).
2. Commit on the branch using Conventional Commits.
3. Push the **branch**: `git push -u origin <branch>`.
4. Open a PR, then merge it.
5. Delete the branch after merge.

### Who merges: a human

**An agent opens the pull request and stops. Merging is the owner's decision, made by a person who has read the change.**

This is a **process rule, not an enforced one**, and the distinction is worth stating plainly rather than hiding. An agent working in this repository acts with the owner's credentials, so GitHub cannot tell the two apart — the commits, the pushes and any merge all carry the same identity. There is no setting that stops the agent merging without also stopping the owner. Anyone who tells you otherwise has not checked.

So the rule is kept where it can be kept: as a stated boundary, and by the agent not pressing the button. It is written here rather than promised in a chat window.

### Making it structural — and the trap in the obvious version

The obvious move, `required_approving_review_count: 1`, **would freeze this repository rather than gate it.** With one account, the author of every pull request is also the only possible approver, and GitHub forbids self-approval. Nothing would merge at all. That is the same failure as a required status check no workflow produces: a rule that cannot be satisfied, which reads as "everyone is blocked" rather than "the rule is wrong".

To make "nothing merges without a human approval" enforceable, a **second identity** is required — a bot account or a GitHub App that opens the pull requests, so their author is not the human who approves. Then the ruleset can require one approval, and no change can land unread. Until that exists, the honest description of this gate is *convention*, and it should not be described as more.

Direct pushes to `main` are rejected, and **the rejection names the rule that fired**. A rule protecting `main` is now enforced in two places: classic branch protection (`enforce_admins` enabled, so it applies to administrators too) and an active **ruleset** (`main-protection`, `bypass_actors: []`, `current_user_can_bypass: "never"`). Both apply as a *union* — a ruleset does not override classic protection, it adds to it.

Never force-push or rewrite history on `main`. Never delete or bypass the protection to land a change; if a change genuinely cannot go through a PR, that is a signal the change needs rethinking, not that the rule needs an exception.

## Verification

Four layers, and only the last two are authoritative:

1. **Local hooks (opt-in, bypassable).** `githooks/` holds a `commit-msg`, a `pre-commit` and a `pre-push` hook. Git does not read a committed directory by default, so they exist only after **`npm run hooks:install`** — one command, once per clone. Until it is run, nothing stops a commit locally. `git commit --no-verify` bypasses them deliberately at any time.

   The three are a **ladder**, strictly nested, cheapest first — `commit-msg ⊆ pre-commit ⊆ pre-push ⊆ CI`:

   | Hook | What it runs | Cost |
   |---|---|---|
   | `commit-msg` | the Conventional Commits rule, from `scripts/check-commit-msg.mjs` | instant |
   | `pre-commit` | a secret scan over the staged diff, then the linter | ~2s |
   | `pre-push` | `npm test`, `npm run build`, the bundle assertion, and the **refusal of a direct push to `main`** | ~5s |

   **`pre-commit` is kept cheap on purpose.** A hook slow enough to be annoying is a hook people learn to skip with `--no-verify`, and then it protects nothing. Anything slower belongs at push time.

   **The secret scan is a heuristic, not a scanner.** It looks only at lines being *added*, requires both a credential-shaped name and a 20+ character value, skips anything containing `CANARY`, `example`, `placeholder` or `redacted`, and honours an inline `secret-scan:allow`. It has no entropy model and cannot catch a credential already in the tree. It is not a substitute for the repository-level scanning tracked as `SUP-007`.

   **None of this is the authority.** A hook is a pre-flight: passing it means the cheap defects are gone, not that the change is correct. CI re-runs everything, and the merge gate is what actually stops a bad change.

2. **Local gate (fast, bypassable).** `npm test` and `npm run build`, roughly five seconds together. Bypassable by simply not typing them, which is why they cannot be the last line of defence.
3. **Remote CI.** `.github/workflows/ci.yml` runs `npm ci`, `npm test`, `npm run build` and a build-artifact assertion on every pull request and every push to `main`. It invokes the same canonical command as layer 2, deliberately — a CI job with its own private check list drifts from what a developer can reproduce.
4. **The merge gate (authoritative).** The `verify` check is a **required status check**, with `strict_required_status_checks_policy` on, so a PR cannot merge while it is red *or* while the branch is behind `main`. Verified by attempting a direct push and reading the rejection: `Required status check "verify" is expected`.

**The context name is exactly `verify`** — the *job's* `name:` in the workflow, not the workflow's `name:`. If the job is ever renamed, the ruleset must be updated in the same change or the gate waits forever for a check that no longer reports.

### The workflows, and which of them gate a merge

| Workflow | Job(s) | Gates a merge? |
|---|---|---|
| `ci.yml` | `verify` | **Yes** — the merge gate |
| `conventions.yml` | `Branching Strategy`, `Conventional Commits`, `Branch protection still matches its documentation` | **Two of the three** — the first two are required; the protection job reports |
| `action-pins.yml` | `Every action is pinned to a commit SHA` | **Yes** — required |
| `codeql.yml` | `Analyze (javascript-typescript)`, `Analyze (actions)` | No — reports to the Security tab |
| `scorecard.yml` | `Scorecard analysis` | No — publishes an external score |
| `release.yml` | `Build and attest` | No — runs on a tag, not a PR |
| `scheduled.yml` | `Official links still resolve`, `Dependency advisories` | No — runs weekly, not on a PR |

**A workflow that reports a required check must trigger on `pull_request`.** A required check that no workflow produces never reports, so the pull request waits for it forever. That is a whole-repository deadlock rather than a red build — every PR blocked, with nothing visibly broken — and it is worth checking by name before adding a check to the ruleset.

`conventions.yml` and `action-pins.yml` are deliberately separate from `ci.yml` so that the required checks have one clear owner. `ci.yml` runs the canonical local command and must stay reproducible on a developer's machine; the policy checks are not that.

**`check:protection` is a job here rather than a required check, on purpose.** It reads the live ruleset over the network; making it required would mean a GitHub API outage blocks every merge. It is still run on every pull request, so a drift from `.github/BRANCH-PROTECTION.md` is visible immediately.

**Watch the interaction with Dependabot.** `strict_required_status_checks_policy: true` means any merge into `main` invalidates other open PRs until CI re-runs. That is correct for a multi-person repo and mildly annoying for a solo one with bot PRs open. It can be relaxed per-repo without touching the required check itself.

## Commit conventions

Use Conventional Commits: `feat:`, `fix:`, `data:`, `docs:`, `test:`, `chore:`, `ci:`. One logical change per commit.

`ci:` was added here in v0.48.0 because the history already used it (three commits) while this list did not name it — the check below found the gap, which is the point of having one.

`data:` is this repository's own type for a change to the catalog or to `requirements.json`, and it is **not** in the conventional-commits default set. That is why `.github/workflows/conventions.yml` enumerates the types instead of delegating to a linter's default: the default would reject this repository's own history on day one.

**Enforced, not remembered** (v0.48.0). `.github/workflows/conventions.yml` checks the branch name and every commit in a pull request's range. Both rules had been written down here for many releases and were held by nothing but a careful human — and one commit in this repository's history (`Sourcing batch 7; …`, v0.41.0) shows what that is worth.

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

**A write that fails must say so, and the warning must persist.** `localStorage.setItem` throws when
the quota is full or storage is blocked (private mode, a site-data policy, a locked-down profile).
Never call it directly and never swallow it: route every write through `persist()` in `App.jsx`,
which reports the failure, and render a warning that **stays on screen** — a 2.4-second toast is
the wrong shape for "nothing you do here is being kept". Until v0.40.0 three of the four writes
called `setItem` directly, so a failure threw inside a click handler and the control simply looked
dead, while the fourth swallowed it and the reader's tracker silently stopped saving. The sidebar
promises *"Your data stays on this device"*; a write that fails is the one case where that promise
needs checking rather than asserting.

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

