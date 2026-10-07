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
npm test             # the canonical gate: node --test, then catalog validation, then the render smoke test
npm run test:render  # just the render smoke test (every view, empty + populated browser)
npm run check:links  # catalog validation plus a liveness probe of every official link (needs network)
npm run build        # production build to dist/
npm run preview      # preview production build
node scripts/validate-catalog.mjs  # standalone catalog validation
node scripts/validate-catalog.mjs --links --catalog=<path>  # validate a fixture catalog
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

## File boundaries

| Path | Purpose |
|------|---------|
| `src/App.jsx` | The React application (all views, state, filtering). Deliberately free of mount-time DOM access so it can be rendered outside a browser. |
| `src/main.jsx` | Entry point. Imports `App` and mounts it. Keep it to this and nothing else. |
| `src/styles.css` | All styling including dark mode |
| `src/countries.js` | Flag and destination helpers, derived from `data/countries.json` |
| `src/eligibility.js` | Per-country eligibility verdict (pure, unit-tested) |
| `src/tracker.js` | Deadline countdowns and the document checklist (pure, unit-tested) |
| `data/scholarships.json` | Canonical scholarship catalog |
| `data/scholarships.test.js` | Catalog validation tests |
| `scripts/validate-catalog.mjs` | Standalone validation script |
| `scripts/render-smoke.mjs` | Renders every view (empty + populated) to catch runtime errors |
| `docs/` | Architecture, schema, API notes, roadmap |
| `.github/` | Issue templates, PR template, and `workflows/ci.yml` |

**Keep decision logic in the pure modules, not in the component.** `eligibility.js` and `tracker.js` exist so that the two parts most likely to be subtly wrong — nationality rules and date arithmetic — can be unit-tested offline. Anything a test could pin down belongs there.

**Never add mount-time DOM access to `src/App.jsx`.** A module-level `createRoot(document.getElementById('root'))` is what made the component unloadable anywhere but a browser, and that is exactly why a `ReferenceError` in one view shipped undetected for six versions. `scripts/render-smoke.mjs` renders all six views against both an empty and a populated browser; `npm test` runs it. Note that `node --test` still reads only the catalog and the pure modules, and a successful build still proves only that an identifier is *referenced* — the render smoke test is the only thing that executes a view's branches.

Do not create new top-level directories without documenting the reason. Country subdirectories under `data/scholarships/` are reserved for a future split-loader; the current app reads only the flat JSON file.

## Branch and merge policy

**`main` is protected. Every change goes through a pull request — no exceptions, including for a one-line data edit or a state-only commit.**

1. Branch off `main`: `git checkout -b <type>/<slug>` (e.g. `data/add-kenya-record`, `fix/deadline-parsing`).
2. Commit on the branch using Conventional Commits.
3. Push the **branch**: `git push -u origin <branch>`.
4. Open a PR, then merge it.
5. Delete the branch after merge.

Direct pushes to `main` are rejected by branch protection (`GH006: Changes must be made through a pull request`), with `enforce_admins` enabled — so the rule applies to administrators too, and cannot be bypassed by accident.

Never force-push or rewrite history on `main`. Never delete or bypass the protection to land a change; if a change genuinely cannot go through a PR, that is a signal the change needs rethinking, not that the rule needs an exception.

## Verification

Three layers, and only the last one is authoritative:

1. **Nothing at commit time.** This repository has no git hooks — `core.hooksPath` is unset and `.git/hooks` holds only the sample files. Nothing stops a commit locally.
2. **Local gate (fast, bypassable).** `npm test` and `npm run build`, roughly a second together. Bypassable by simply not typing them, which is why they cannot be the last line of defence.
3. **Remote CI (authoritative).** `.github/workflows/ci.yml` runs `npm ci`, `npm test` and `npm run build` on every pull request and every push to `main`. It invokes the same canonical command as layer 2, deliberately — a CI job with its own private check list drifts from what a developer can reproduce.

**The workflow is not registered as a required status check.** Branch protection requires a pull request, but not a passing check, so CI can be red while a merge still succeeds. Making it required is an externally visible change to the merge gate and is left as a decision for the owner; if it is made required, the context name to require is exactly `verify`.

## Commit conventions

Use Conventional Commits: `feat:`, `fix:`, `data:`, `docs:`, `test:`, `chore:`. One logical change per commit.

## AI assistant policy

The AI settings UI is a placeholder. No provider integration exists yet. If adding one:
- Keys must stay in browser memory/localStorage only, never sent to any server owned by this project.
- Clearly disclose that prompts leave the browser.
- Do not treat model output as authoritative scholarship data.

## Privacy

No PII leaves the browser. Personal state lives in localStorage under `sh-profile` (study goals, country of origin), `sh-saved` (shortlist ids), `sh-tracker` (tracked applications and their status), `sh-docs` (document checklist) and `sh-dark` (theme). Anything new that stores personal state belongs in the same place, is read back defensively, and must not be sent anywhere. Users on shared devices should clear storage after use.

