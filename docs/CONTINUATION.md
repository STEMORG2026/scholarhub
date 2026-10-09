# In progress — where we are, and what the next steps are

Updated 2026-10-09. This file exists so that work can be picked up cold.

## Status: nothing is in flight

`main` is clean, shippable, and has no half-finished work on it. Both pieces that were open are
done and released:

| Piece | State |
|---|---|
| **1. Finish the audit's deferred recommendations** | ✅ Done — v0.42.0, v0.42.1 |
| **2. The class-rank feature** | ✅ Done — v0.43.0 (comparison), v0.44.0 (input) |
| **3. The sourcing pass** | ⏸ 45 of 50 — 5 blocked, each with a documented cause |

The last section is a list of **decisions and directions**, not unfinished work. Nothing there
blocks anything.

---

## 1. The audit — done

Score **63.4 → 74.8/100**, maturity `mvp → beta`, **no critical since v0.40.0**.

Shipped: ESLint as the first stage of `npm test`, coverage floors (92/82/92 against
95.74/87.76/96.06), the `source-map-js` HIGH advisory fixed (0 vulnerabilities), an ErrorBoundary,
`.editorconfig`, `.github/CODEOWNERS`, `.github/BRANCH-PROTECTION.md` and `npm run check:protection`,
and release tags with GitHub releases.

**Still open, each with a written reason rather than a shrug:**

| Finding | Why it is not being fixed |
|---|---|
| `INV-SEC-001` security headers, `SEC-018` | No server. Response headers belong to the host. Only a `<meta http-equiv>` CSP could live in the repo. |
| `SEC-025` password hashing | **False positive.** There is no authentication anywhere; the only match is `type="password"` on the masked API-key input. |
| `SUP-022/023/024` SLSA, VSA, Sigstore | Nothing to attest. There is no container and no release artifact. |
| `CICD-006` IaC, `FND-011` Dockerfile | No infrastructure and no container. |
| `CICD-008` error tracking | Needs a backend to receive reports, which this project deliberately does not have. The ErrorBoundary shows the reader the error instead. |
| `CQ-002` formatter | **Prettier deliberately not adopted.** It would reformat every file in the repository — a change to make on purpose, not as a footnote — and an unenforced formatter config is worse than none. `.editorconfig` covers the editor-level basics. |

## 2. The class-rank feature — done

Three records carry a real academic threshold expressed as a **class position**: TU Delft's top
10%, MS²'s best 35%, DAAD EPOS's upper third. All three now produce a verdict.

**The design point, which is the part worth not losing: a rank is a *position*, and position runs
the other way.** Every `rank` rule means "the top N%", so the reader meets it when their own
position is **≤ N** — a reader in the top 8% meets a top-10% bar. That is the opposite comparison
from `numeric` and `count`, where larger is better.

**This is why the feature does not need the `direction` field** still open in
`REQUIREMENTS-SCHEMA.md` §3.5. `direction` is for a downward **scale** — MS²'s German "up to 2.8",
where the *number itself* runs backwards. A position is a different thing: the number is ordinary
and only the **comparison** flips. The `rank` kind already says which; no flag is required.

`percentile` runs the *ordinary* way — GKS asks for "a score percentile of 80% **or above**" — so
`rank` and `percentile` are opposite, and they were split into separate branches in v0.43.0. They
shared one before that, which would have inverted one of them.

**Verified end to end.** With a recorded `top 8%`: **3 met**. With `40 of 120` (top 33.33%):
**1 met, 2 failed** — and the boundary is exactly right, `33.33%` fails DAAD EPOS's upper third
(33) while meeting MS²'s top 35%. With a GPA *and* a rank: **6 met, and `unresolvable` gone
entirely**. Confirmed in a browser on both render sites.

**Two things the tests caught during the build, worth remembering:**

- `parseClassRank` read `"8 of -120"` and `"-5"` as valid percentages, because the digits after a
  minus were matched and the minus ignored. On a comparison that runs backwards, flattering the
  reader means passing them into bars they do not meet.
- The detail dialog gated its verdict row on `confirmedGpa`, which was correct while a GPA was the
  only comparable value — and hid **every** verdict from a reader with a class position instead.
  The gate is now on the *result* ("this record produced an answer"), which is what it always
  meant.

## 3. The sourcing pass — 45 of 50

Fulbright was recovered in v0.45.0 by finding the right page rather than retrying the same URL —
its eligibility page is `/fulbright/ffsp/general-requirements/`, not the path the Humphrey grant
uses. **Try that approach on the remaining five before accepting them as blocked.**

One display defect was found by sourcing it: `quote` was `null` on a `meets`/`fails` verdict, so
the provider's own wording was invisible exactly when a requirement contained an alternative route
(Fulbright's is *"60% aggregate or 3.0 GPA system"*). Fixed in v0.45.0 — the wording is now carried
on every verdict.

---

## What is actually next — decisions, not tasks

Nothing here is in flight. These are the open questions, in the order they matter.

1. **The sourcing pass is at 45 of 50, and the remaining 5 are blocked.** Each has a documented
   cause: ETH (criteria exist only in a client-rendered accordion; only aggregators carry them, and
   those are not acceptable sources), NSF (**region-blocked on both `nsf.gov` and `nsfgrfp.org`** —
   deliberate, not routed around), CSC (HTTP-412), UC (client-side `PageAssist`), RESCO
   (Cloudflare). **Fulbright was on this list and is not any more** — it was recovered by finding
   the right path rather than retrying the same one, which is worth trying for the others before
   accepting them as blocked. **The decision is whether to accept 45/50 as the end of the pass**,
   since the marginal value of the last five is lower than any of them individually suggests.

2. **`direction` is still unbuilt and still unneeded.** It would only be required if a rule ever
   encoded a downward *scale* rather than a position — MS²'s German "up to 2.8" is the standing
   example, and it is deliberately recorded as `prose`. Build it when a second such case appears,
   not before.

3. **The catalog's `eligibility.gpa_minimum` scalar is now legacy.** The app prefers
   `data/requirements.json` and falls back to the scalar only for unsourced records. Three
   validation warnings mark where the two disagree. **When the pass is declared finished, the
   right move is to drop the scalar, not reconcile it.**

4. **The Phase 3 open items are all closed.** The `unresolvable` sentence variants landed in
   v0.38.0; `delegated` and `not-published` in v0.37.0. Nothing is waiting on a reader any more.

---

## Standing constraints

Each of these has already cost something, which is why it is written down.

- **Never push to `main`.** Branch → PR → merge. This is **enforced**, not remembered, and it
  caught me: I committed a version bump straight onto `main` and the ruleset rejected it
  (`push declined due to repository rule violations`). A rule that lives only in memory gets
  broken by accident.
- **A local measurement is not a CI measurement.** Hit **twice in two releases**: dates (the
  validator compared against UTC while Nepal is UTC+05:45 — fixed with a one-day tolerance) and
  coverage (this development environment injects `node-language-shim.cjs` and
  `node-safe-delete-shim.cjs` into every Node process, 43% between them — fixed with
  `--test-coverage-include`). Run `TZ=UTC npm test` before believing a local result.
- **A scanner finding is a claim, not a fact.** Three false positives in this project's short audit
  history, and **all three came from statements that were true**: the smoke test's leak canary, a
  `type="password"` API-key field, and a comment that explained an empty catch by quoting the
  pattern. Verify before repeating.
- **Node's test runner refuses `.jsx`.** No component can be unit-tested; put anything worth
  testing in a plain `.js` module and let the `.jsx` only arrange it.
- **`renderToStaticMarkup` cannot test an error boundary**, and a boundary catches errors in
  **descendants** — a throw written inline in its own JSX happens *above* it.
- **Bash heredocs fail with `Bad substitution` when the content contains a dollar-brace
  interpolation.** Use the Edit/Write tool for anything with template literals. Two attempts were
  lost to this.
- **Coverage floors only ratchet up.** Raise them, never lower them.

## Where to look

- `AGENTS.md` — the working agreement, including the traps above.
- `docs/REQUIREMENTS-SCHEMA.md` — the requirement entity, and every open item with its reasoning.
- `USA-AUDIT-TRIAGE.md` — the audit, with every finding verified and classified.
- `CHANGELOG.md` — what each release changed and why, including the mistakes.
