# USA audit of scholarhub — verified triage

Tool: `Universal_Software_Auditor` (repo build, **v2.26.1**) run as
`node /home/sajan/Projects/Universal_Software_Auditor/dist/cli.js audit .`

> **The `usa` on `$PATH` is a different, much older build.** `~/.local/bin/usa` resolves to
> `@xenos1996/usa@2.8.2` installed 2026-09-14, while the repo in `/Projects` is at **2.26.1**.
> This run used the repo build. Results from the two are not comparable.

> **Status: triaged 2026-10-09, then acted on in v0.40.0.** The two findings that mattered
> (`SUP-003` five `"latest"` specs; `CQ-005` silent persistence failure in `App.jsx`) are fixed,
> along with `REPO-009` (SECURITY.md), `SUP-010` (SHA-pinned actions), `FND-010` (.nvmrc) and
> `TEST-004` (coverage, 84.06%). The canary was de-shaped so the `SEC-001` false positive cannot
> recur. The linter, tags, and ErrorBoundary are deliberately deferred — see `CHANGELOG.md`
> 0.40.0. This document is left as the audit record, not as a current gap list.

Raw report: `USA-AUDIT.md` (813 lines). Score **63.4/100 (mvp)** — the expected band for
MVP is 45–75, so the score is *within band*. 55 passed · 1 critical · 3 high · 4 medium ·
24 low · 16 future · 28 needing human review.

Every finding below was checked against the repository before being repeated here.

---

## 1. The four "Immediate Action Required" items — all four are wrong

| Rule | Tool says | Verified reality |
|---|---|---|
| `SEC-001` 🔴 CRITICAL | "No hardcoded credentials in source" at `scripts/render-smoke.mjs:348` | **False positive.** The string is `const SECRET = 'sk-ant-SECRET-DO-NOT-RENDER'` — the smoke test's own leak canary, searched for in rendered markup to prove the key never reaches visible text. It is not a credential; it is the sentinel for a test that the key does *not* leak. |
| `SEC-025` 🟠 HIGH | "Adaptive password hashing is present where auth exists" | **False positive.** There is no authentication anywhere in this app — no server, no accounts, no passwords. The only match is `type="password"` on the masked API-key input in `AiSettings.jsx:93`. Nothing to hash. |
| `INV-SEC-001` 🟠 HIGH | "Encrypted transport is backed by security headers" | **Not repo-actionable.** There is no server to set headers on; it is a static client-side bundle. Response headers are the host's (GitHub Pages). Only a `<meta http-equiv>` CSP could live in the repo. |
| `REPO-009` 🟠 HIGH | "SECURITY.md published" | **True.** No `SECURITY.md`, `.github/SECURITY.md` or `docs/SECURITY.md` exists. |

### Also a false negative, not a gap

| Rule | Tool says | Verified reality |
|---|---|---|
| `TAS-010` | "Tests assert failure paths" — pattern not found | **False negative.** The detector looks for `throws`/`rejects`/`toThrow`. This repo asserts failure by **subprocess exit status** and negative matching — `assert.notEqual` / `doesNotMatch` / `notDeepEqual` appear **25 times in `data/requirements.test.js` alone**. That style is stronger for what it tests and invisible to a pattern that only knows exceptions. |

**Of the 4 items the tool put in "SPRINT 0 · stop the bleeding", 3 are false positives and the
4th (SECURITY.md) is a two-line file.** The one thing genuinely worth an immediate fix is not in
SPRINT 0 at all — it is `SUP-003`, below.

---

## 2. Genuinely missing, ranked by real consequence

### `SUP-003` — all five dependencies are declared as `"latest"`

The tool reported 4 occurrences and downgraded it to LOW. **It is 5, and it is the most
consequential finding in the report.**

```
"@vitejs/plugin-react": "latest",  "vite": "latest",  "react": "latest",
"react-dom": "latest",  "lucide-react": "latest"
```

The lockfile pins real versions (`react@19.3.0`, `vite@8.3.1`) so `npm ci` in CI is
reproducible — **but the declared spec in `package.json` *and* in the lockfile's own root entry
is `"latest"`**. A fresh `npm install` on any clone re-resolves `latest` and rewrites the lock.
So a new contributor silently upgrades React and Vite, and the bundle ceiling only catches it
after the fact. Pin exact versions.

### `CQ-005` — two swallowed errors, one of which loses reader data

- `src/App.jsx:96` — `const persist=(key,value)=>{try{localStorage.setItem(...)}catch{}}`
  **This is the substantive one.** If storage is full or blocked, the reader's tracker and
  profile silently fail to save and the UI says nothing. The reader believes their work is
  stored. That is this project's own "confident wrong answer" failure mode, inside the project.
- `scripts/validate-catalog.mjs:265` — `try { await res.body?.cancel(); } catch {}`. Best-effort
  cleanup; the comment above explains the `cancel`, not the swallow.

### `SUP-010` — CI actions are not pinned to a commit SHA

`actions/checkout@v7` and `actions/setup-node@v7` (`ci.yml:66,74`) — mutable tags. Note these
were *just* bumped by Dependabot, which is exactly the window in which a tag can move under you.
Pinning to a 40-hex SHA with a trailing `# v7` comment keeps Dependabot able to raise PRs.

### `REL-001` / `REL-002` — 23 releases, zero tags

`usa detect` reports **`tags: 0`** against 62 commits and a `package.json` now at **0.39.0**.
Versioning is disciplined and SemVer-shaped; nothing is tagged. "What is deployed?" has no
lookup. Cheap to fix and it makes every future audit comparable (`usa diff`).

### `CQ-001` / `CQ-002` — no linter, no formatter, no `.editorconfig`

Verified absent: no `eslint.config.*`, no `.prettierrc*`, no `.editorconfig`, no `tsconfig.json`.
The repo's style discipline is real but entirely by convention.

### `FND-010` — runtime not pinned

No `.nvmrc` or `.node-version`. CI hardcodes `node-version: '24'`; a local shell can be anything.

### `SUP-006` / `SUP-007` — no SAST, no secret scanning in CI

Secret scanning is the one that pays here: **gitleaks would flag the `SEC-001` canary**, which
is how the false positive above would be caught automatically rather than by hand.

### `FND-004` — branch protection exists but nothing records it

The merge gate is real and has been proven by attempting a direct push (`GH006` /
`Required status check "verify" is expected`). None of that is visible to anyone reading the
repo. A policy file under `.github/` would make the strongest control in this project auditable.

### `TEST-004` — coverage is not measured

`node --test --experimental-test-coverage` is built into the runtime already in use. 256 tests,
no coverage number published.

### `WEB-006` / `CICD-008` — no ErrorBoundary, no client-side error reporting

Relevant because it already happened: a `ReferenceError` in one view **shipped undetected for
six versions**. An ErrorBoundary is the control that would have caught it, and there is no
backend to receive a crash report.

### `FND-005` — no ADRs

Decisions are recorded in `CHANGELOG.md` and `AGENTS.md`, at length and well. There is no
`docs/adr/`. Whether that matters is a preference, not a defect.

---

## 3. Correctly flagged but not applicable to this project

Dockerfile / IaC / compose (`CICD-006`, `FND-011`), SLSA provenance / VSA / Sigstore signing
(`SUP-022`, `SUP-023`, `SUP-024`), CODEOWNERS for a solo repository (`FND-003`, `REPO-014`),
`.env.example` (the app reads no environment variables), `tests/unit|integration|e2e` layouts
(`TAS-001/002/003`, `FND-008` — the 256 tests are co-located and the smoke test is the e2e path),
and `.editorconfig` (cheap, but the only real value is editor consistency).

---

## 4. What the tool could not see, and the repo is stronger than the score suggests

- **The merge gate.** 1 critical + 3 high in SPRINT 0, but the project's actual highest-value
  control — `enforce_admins: true` on `main` with a required `verify` check, proved by attempting
  a direct push — is invisible to a static scan.
- **Negative-control test discipline.** Every guard in this repo was verified by planting its
  defect and observing the failure. No scanner detects that, and `TAS-010` actively reports the
  opposite.
- **S1 scored 7.6/10 with 0/2 judgement checks recorded.** Several sections show `never` in the
  "Last reviewed" column; that column is what `usa` uses to decide a review is overdue.

---

## 5. One-line summary

The tool found one thing that genuinely matters and the report does not rank it (`"latest"` × 5),
one thing that loses reader data (`App.jsx:96`), and three false positives it put in
"stop the bleeding". Its own headline critical is a test canary.
