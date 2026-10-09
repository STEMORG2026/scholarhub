# In progress — where we are, and what the next steps are

Updated 2026-10-09. This file exists so that work can be picked up cold.

## Status: nothing is in flight

`main` is clean, shippable, and has no half-finished work on it. Both pieces that were open are
done and released:

| Piece | State |
|---|---|
| **1. Finish the audit's deferred recommendations** | ✅ Done — v0.42.0, v0.42.1 |
| **2. The class-rank feature** | ✅ Done — v0.43.0 (comparison), v0.44.0 (input) |
| **3. The sourcing pass** | ✅ Closed at 49 of 50 — CSC is blocked, and the reason is measured |

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

## 3. The sourcing pass — 49 of 50

**Four records came off the blocked list in v0.46.0, and none of them was unblockable.** Three needed
a different *route* rather than a retry; one had been recorded as blocked and never was.

| Record | Recorded cause | What actually worked |
|---|---|---|
| ETH Zurich ESOP | criteria only in a client-rendered accordion | rendering the accordion — *"top 10% of Bachelor's degree programme = grade A; this is based on self-assessment"*, a `rank` rule that now **produces verdicts** |
| RESCO (EMJM) | Cloudflare | the consortium's own *"Who can apply?"* page: bachelor's / **180 ECTS** / 3 years, plus English at B2 (IELTS 6.5, TOEFL 80). No grade bar |
| University of Canterbury | client-side PageAssist | the scholarship portal: four weighted criteria, **no grade bar** |
| NSF GRFP | **"region-blocked on both `nsf.gov` and `nsfgrfp.org`"** | **not blocked at all** — the pages load in a browser. The gate is citizenship: *"must be a U.S. citizen, national, or a permanent resident"* |

**The NSF entry is the one worth reading.** A tool failure had been written down as a property of the
source, and it stayed written down for a release. The distinction matters: *"I could not fetch it"*
and *"it is not available"* are different claims, and only the second belongs in a block reason.

**The lesson from Fulbright held.** Fulbright was recovered by finding the right path; the same move
recovered three more. Try a different route before accepting a block.

**CSC is the last one, the pass is closed at 49 of 50, and the reason is measured rather than
assumed.** A second check (v0.47.0) tried the move that recovered the previous four — a different
*route*, not a retry — and read no more, but it did establish what the block actually is:

- `campuschina.org` and `csc.edu.cn` sit behind the **same China Telecom Global CDN edge**
  (`ctgcdn.com`), which is why the two behave identically.
- Both answer **HTTP 412 carrying a JavaScript bot-protection challenge** rather than a page.
- The challenge is served to **every route tried**: every user agent (Chrome, `curl`, Googlebot,
  mobile Safari, and an empty one), every path (the root, `/scholarships/`, `/universities/`, and
  the record's own application path), and **both address families**.
- A headless browser gets an **empty document** instead of the challenge page, so it is not solved
  from here.

**The check also found a sentence that was false about the host.** The note claimed `campuschina.org`
*"resolves only an IPv6 (AAAA) address"*. It resolves an **IPv4 address too** (`203.33.8.147`), and
both answer 412 — so that clause described how *this machine's resolver* was read, written down as a
property of the host. Same class as v0.46.0's *"region-blocked"*. The note no longer infers that
*"the block is on this network rather than on the portal"* either: what was measured is that every
client tried met the challenge, and that is what it now says.

The reachable restatements of CSC's rules are **host-university programme pages** — HIT Shenzhen's
Type B announcement carries the age rules (under 35 for a master's, under 40 for a doctoral) and the
language rules (TOEFL ≥ 80, IELTS ≥ 6.0), and no GPA bar — but those are one host university's
route-specific rules, not the Council's general ones. **This project sources the provider**: HIT's
own scholarship cites HIT's own page because HIT *is* its provider. So CSC stays unrecorded rather
than recorded from the wrong page. **If it is ever recovered, the route is a CSC page that renders —
not a host university's.**

**Two display defects were found by sourcing, one in each of the last two releases.** Fulbright
(v0.45.0) exposed `quote` being `null` on a `meets`/`fails` verdict, hiding a provider's alternative
route exactly when it mattered. NSF (v0.46.0) exposed the `criterion-only` sentence claiming the
provider *"records how academic performance is weighed"* — true of a record that weighs grades
without a bar, false of one gated on citizenship. **Twice now, sourcing a record found a sentence that
was confidently wrong about the record it was attached to.** That is the argument for finishing the
pass rather than the argument for stopping.

---

## What is actually next — decisions, not tasks

Nothing here is in flight. These are the open questions, in the order they matter.

1. **The sourcing pass is closed at 49 of 50 — the decision is made, not pending.** The one attempt
   still owed was made in v0.47.0, on the move that recovered the previous four, and it did not
   recover CSC; it turned the reason from a status code into a measurement (§3). The pass ends
   here: one record, blocked, with a reason that names what was tried. **This closure unblocks
   item 3.**

2. **`direction` is still unbuilt and still unneeded.** It would only be required if a rule ever
   encoded a downward *scale* rather than a position — MS²'s German "up to 2.8" is the standing
   example, and it is deliberately recorded as `prose`. Build it when a second such case appears,
   not before.

3. **The catalog's `eligibility.gpa_minimum` scalar is legacy — and dropping it is the next action,
   now that the pass is declared finished.** The app prefers `data/requirements.json` and falls back
   to the scalar only for unsourced records. **Five** validation warnings mark where the two disagree
   — tu-delft, ms2, daad-epos, fulbright and, as of v0.46.0, eth. All five are the same shape: a
   **figure** rule (`numeric`, `branches` or `rank`) against a `null` scalar, because a bare number
   in that scalar would be scale-ambiguous — no record carries `gpa_scale`. Records whose finding is
   *prose* write the scalar and do not warn. **The right move is to drop the scalar, not reconcile
   it.**

   **Scope, so this is not mistaken for a delete of one field:** the scalar is *read* by `compareGpa`
   in `src/compare.js` (the fallback path), *warned about* by `scripts/validate-requirements.mjs`, and
   used as fixture data in `src/ingest.test.js`; it is documented in `docs/DATA-SCHEMA.md` and
   `docs/scholarship.template.json`. And **5 of the 50 records carry a *prose* scalar, not a number**
   (`groundwater-emjm`, `mext-research-students`, `gks-graduate`, `kaust-fellowship`, `pec-pg-brazil`),
   so "drop the field" and "drop the number" are not the same edit. Worth its own release, not a
   footnote to this one.

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
