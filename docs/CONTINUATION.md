# In progress — where we are, and what the next steps are

Updated 2026-10-09. This file exists so that work can be picked up cold.

## The two halves of the work

| Half | State |
|---|---|
| **1. Finish the audit's deferred recommendations** | ✅ **Done and shipped** — v0.42.0, v0.42.1 |
| **2. Continue building ScholarHub** | ⏸ **In progress** — see below |

---

## Half 1 — done

Audit score **63.4 → 74.8/100**, maturity `mvp → beta`, **no critical since v0.40.0**. Three
releases tagged and published: `v0.41.0`, `v0.42.0`, `v0.42.1`.

Shipped: ESLint (now the first stage of `npm test`), coverage floors (92/82/92 against
95.59/87.26/96.03), the `source-map-js` high-severity advisory fixed (0 vulnerabilities), an
ErrorBoundary, `.editorconfig`, `.github/CODEOWNERS`, `.github/BRANCH-PROTECTION.md` and
`npm run check:protection`.

Still open from the audit, each with a written reason: `INV-SEC-001` security headers and
`SEC-025` password hashing (no server, no auth — false positives), `SUP-022/023/024` SLSA/VSA/Sigstore (nothing to attest for a static bundle), `CICD-006`/`FND-011` IaC and Dockerfile (no
container), `CICD-008` error tracking (needs a backend this project deliberately lacks).
Prettier is deliberately not adopted — it would reformat the whole repository, and an unenforced
formatter config is worse than none.

---

## Half 2 — the class-rank feature

### Why this feature

Measured, not guessed. Three records carry a real academic threshold expressed as a **class
position**:

| Record | Rule |
|---|---|
| `tu-delft-van-effen` | `rank: 10 of 100` — "top 10% of graduates" |
| `ms2-emjm` | `rank: 35 of 100` — "the best 35% of students" |
| `daad-epos` | `rank: 33 of 100` — "the upper third" |

A reader's profile has no class rank, so all three currently return `unresolvable`. Adding the
field is the single highest-value build available: **three records move from `unresolvable` to
`meets`/`fails`**, which is more than any grade-conversion work would unlock. (Compare: of the six
records with a comparable figure, only three — KAUST, MEXT, GKS — can be checked against a GPA at
all.)

### ✅ Done in this increment (committed)

`src/compare.js`:

- `compareGpa(record, value, requirement, classRank)` and
  `compareAllGpa(records, value, requirementsIndex, classRank)` — the class rank is threaded
  through.
- The `rank` branch now produces a **real verdict** when a position is present.
- The `percentile` branch was **split out of the `rank` branch** (they shared one before).

**33 tests in `src/compare.test.js`**, including three that pin the direction:

- `top 8%` **meets** a top-10% bar; `top 11%` fails; exactly `10` meets.
- a percentile does **not** use the rank comparison;
- with no position recorded, a rank says what would be needed (`Add your class position`).

Three defect classes planted and each observed to fail: inverting the comparison (3 tests),
letting percentile share the rank branch (2 tests), treating a missing position as satisfied
(3 tests).

### ⏸ Not done — the exact next steps

1. **`parseClassRank(input)`** — a pure parser, to live in `src/compare.js` next to
   `gpaRequirement`. Returns a number (top N%) or `null`. Design decided: **percentage only,
   deliberately narrow** — a reader typing "8th of 120" does their own division. Rationale to
   preserve: a silently misread position produces a confident wrong verdict on the one comparison
   that runs backwards. Reject `0` and `>100` rather than clamping.

   Two bash heredocs failed with `Bad substitution` because the test bodies contain `${...}` — use
   the Edit/Write tool for anything with template literals.

2. **Profile field** — `src/App.jsx`, in the profile form at the `Current GPA (optional)` label
   (line 295). Add a "Class position (top %)" input bound to `profile.classRank`, mirroring how
   `profile.gpa` is bound. It persists via the existing `sh-profile` write.

3. **Wire it in** — `src/App.jsx` line ~300 passes props to `<IngestPanel>`; add
   `currentClassRank={parseClassRank(profile.classRank)}`.

4. **`src/IngestPanel.jsx`** — accept `currentClassRank` in the signature (line 28). Two changes:
   - the comparison is currently gated on `currentGpa` alone (line ~92). It must run when the
     reader has **either** a GPA or a class rank.
   - pass `currentClassRank` into `compareAllGpa`.
   - the strip heading says "Your confirmed GPA against the catalog". That is only true when a
     GPA exists — it needs to adapt when only a class rank is present, or the panel will make the
     same class of false claim this project keeps correcting.

5. **Verify** — full chain, then in a browser: record a class position, and confirm `tu-delft`,
   `ms2` and `daad-epos` each show a verdict rather than "cannot be checked".

### 🔑 The design decision not to lose

**A rank is a *position*, and position runs the other way.** Every `rank` rule means "the top
N%", so the reader meets it when their own position is **≤ N**: top 8% meets a top-10% bar.

This is why the class-rank feature does **not** need the `direction` field that is still an open
item in `docs/REQUIREMENTS-SCHEMA.md` §3.5. `direction` is for a **downward scale** — MS²'s
German "up to 2.8", where the *number itself* runs backwards. A position is different: the number
is ordinary and only the **comparison** flips. The `rank` kind already says which; no flag is
required. Do not add `direction` for this.

Note also that `percentile` runs the *ordinary* way — GKS asks for "a score percentile of 80% or
above, larger is better. `rank` and `percentile` are opposite, which is why they were split into
separate branches.

---

## Standing constraints

- **Never push to `main`.** Branch → PR → merge. This was enforced, and it caught me: I committed
  a version bump straight onto `main` and the ruleset rejected it
  (`push declined due to repository rule violations`). A rule that lives only in memory gets
  broken by accident; the fix is to make it structurally impossible.
- **A local measurement is not a CI measurement.** Hit twice in two releases: dates (UTC vs
  UTC+05:45) and coverage (this environment injects two shim files into every Node process; they
  must be excluded with `--test-coverage-include`). Run `TZ=UTC npm test` before believing a local
  result.
- **A scanner finding is a claim, not a fact.** Three false positives here all came from *true*
  statements: the smoke test's leak canary, a `type="password"` API-key field, and a comment
  explaining an empty catch.
- Node's test runner **refuses `.jsx`**. No component can be unit-tested; put anything worth
  testing in a plain `.js` module.

## Where things stand

- `main` is shippable at all times; the rank logic is committed but **not reachable** until step 4
  lands. That is deliberate and matches the project's own history — `data/requirements.json` was
  built in v0.29.0 and wired in v0.37.0.
- 41 of 50 records carry a sourced requirement. The remaining 6 are blocked with documented
  reasons (ETH: criteria only in a client-rendered accordion; NSF: region-blocked on both
  `nsf.gov` and `nsfgrfp.org`; CSC: HTTP-412; UC: client-side `PageAssist`; RESCO: Cloudflare;
  Fulbright: eligibility page not at the path Humphrey uses).
- Sourcing pass is paused in favour of the build. Resume after the class-rank feature ships.
