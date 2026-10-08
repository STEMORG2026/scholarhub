# Schema — the requirement entity

**Status:** in use, written 2026-10-08. The schema and the five worked examples are real.
The data file now holds **13 records** — the 5 hardest, plus sourcing batch 1 (8 records,
v0.32.0). The remaining 37 are an ongoing sourcing pass.

**Two corrections landed during batch 1** and are recorded in §3.1 and §3.2: the validator
demanded `scale` on a `rank` where the schema says `of`, and the sourcing pass turned out to
be dominated by a case the seven kinds did not name — a *criterion* with no published
threshold.

This is the companion to `SCHEMA-PERSONAL-PROFILE.md`. That document defines the *applicant*
side; this one defines the *requirement* side. A comparison needs both, and they meet only in
the browser — never merged into one shipped file.

---

## 1. Why requirements are their own file, not more fields on a record

The catalog's unit is the **scholarship**. Requirements live at the level of the **program
or the institution**. Those are different entities, and one record can span many of the
latter:

- `daad-study-scholarships` has `university: "German higher education institutions"` and
  `city: "Various"`. It is not a program; it is a scheme over hundreds of programs, each
  with its own requirement.
- `csc-government-scholarship` names no university at all.
- `kaust-fellowship` *is* institution-level — every admitted graduate student gets it — so
  its requirement genuinely belongs to the record.

So the requirement gets its own file, keyed by `record_id`, and a record may carry **zero,
one or many** requirements. Leaving `eligibility.gpa_minimum` as a scalar on the record
forces every provider's rule into one field, which is exactly the shape that has already
failed: 45 `null`, 0 numbers, 5 prose.

---

## 2. Where the requirement entity should live — the one structural trade-off

Three options, and the honest trade-off is shorter paths versus shorter files:

| Option | Shape | Trade-off |
|---|---|---|
| **A. Central file** (chosen) | `data/requirements.json` : `{ [record_id]: Requirement[] }` | One file to source and validate; a reader must fetch it separately from the record |
| B. Inline | `record.requirements: Requirement[]` | Shortest read path; grows `scholarships.json`, which is already the bundle's biggest asset |
| C. Hybrid | a `has_requirements` flag on the record + the central file | Fast "does this record have any" check; two places to keep consistent |

**A is chosen for the proof, and the reason is the sourcing pass, not performance.** A
sourcing pass touches *only* requirements; with option A it is one file, one diff, one
validator, and `data/scholarships.json` is never rewritten (which matters — that file has a
documented serialisation trap; see `MEMORY-scholarhub.md`). If the split fetch ever becomes
the larger cost, option C is the upgrade and it does not require re-sourcing anything.

---

## 3. The entity

```jsonc
{
  "record_id": "gks-graduate",        // must exist in data/scholarships.json
  "requirements": [
    {
      "kind": "gpa",                  // what is being required
      "of": {                         // the rule
        "kind": "branches",
        "branches": [
          { "minimum": 2.64, "scale": 4.0 },
          { "minimum": 2.80, "scale": 4.3 },
          { "minimum": 2.91, "scale": 4.5 },
          { "minimum": 3.23, "scale": 5.0 }
        ],
        "alternatives": [
          { "kind": "percentile", "minimum": 80, "of": 100 },
          { "kind": "rank", "minimum": 20, "of": 100 }
        ]
      },
      "text": "A cumulative GPA of at least 2.64/4.0, 2.80/4.3, 2.91/4.5 or 3.23/5.0 — or a score percentile of 80% or above on a 100-point scale, or a rank in the top 20% of the class",
      "source": "https://www.studyinkorea.go.kr/en/plan/gksNoticeRead.do?bbsId=BBSMSTR_000000000461&nttId=4420",
      "last_verified": "2026-10-07"
    }
  ]
}
```

### The rule discriminator

The rule's `kind` is the load-bearing part. It is what keeps `none-stated` from collapsing
into `unstated`, which the current scalar cannot avoid:

| `kind` | Carries | Meaning |
|---|---|---|
| `numeric` | `minimum` + **`scale`** (both mandatory) | one figure, directly comparable |
| `branches` | `branches[]` of `{minimum, scale}`, optional `alternatives[]` | the reader picks their branch — the provider states several |
| `percentile` | `minimum` + `of` | a percentile bar, e.g. top 20% |
| `rank` | `minimum` + `of` | a class-rank bar |
| `count` | `minimum` + **`unit`** (both mandatory) | a quantity with no ceiling — 240 ECTS |
| `prose` | `text` only, optional `varies_by` | stated, but with no single scalar form |
| `none-stated` | `quote` | **the provider states there is no threshold** |
| `unstated` | nothing | **the catalog has not looked** — the honest default |

`prose`, `none-stated` and `unstated` are three *different facts*. `numeric`, `branches`,
`percentile`, `rank` and `count` are five different *comparison procedures*. All eight are one
closed set, and the validator rejects a ninth.

### 3.1 The dominant case is a criterion, not a threshold

The five worked examples were chosen to be the *hardest*, which made them unrepresentative:
four of them carry a real figure. The sourcing pass is mostly the opposite. Of the first
eight records sourced, **five publish no academic figure at all**. Three distinct situations
fell out, and the kind used for each is a decision, not an accident:

| What the provider publishes | Kind | Why |
|---|---|---|
| A figure (3.0/4.0, top 10%, percentile 80) | `numeric` / `rank` / `percentile` / `branches` | the comparison runs |
| **A rule with no single scalar** — several grading systems, or "excellent" | `prose` | stated, but no number holds it |
| **Grades are a selection criterion, no bar published** (KTH: grades are 1 of 4 criteria; Melbourne: candidates are *ranked* on academic results) | `prose` | something *is* stated — that grades count — and it has no scalar form |
| **Nothing about academic standards published on the page** | `unstated` | nothing is stated, so `prose` would be a claim |
| The provider affirmatively says there is no threshold (Knight-Hennessy) | `none-stated` | the distinct fact |

**The third row is the one that needed a decision.** `unstated` was tempting and would have
been wrong: it renders as *"the catalog does not record a GPA requirement — check the
provider"*, which would **throw away the finding** that the provider does weigh grades. That
is the `pec-pg-brazil` lesson again — a finding must survive as a finding. `prose` keeps it,
at the cost of a sentence in `compare.js` that currently says "more than one scale or
branch", which does not describe a ranked field. **That sentence needs a variant when Phase
3 wires this file to the UI; it is an open item, not a shipped defect**, because nothing in
the app reads `requirements.json` yet.

### 3.2 `unstated` means "checked, nothing published" — not "nobody looked"

`source` and `last_verified` are **mandatory on every requirement**, so an `unstated` entry
necessarily carries the URL that was checked and the date it was checked on. That makes the
schema's own gloss — "the catalog has not looked" — imprecise. What it actually means is
*"the provider's published material was read and states no threshold"*, which is a different
claim from `none-stated` (*"the provider states there is no threshold"*). Both remain
distinct, both remain honest, and neither may collapse into the other.

### 3.3 A portion is `of`, a point on a scale is `scale`

`numeric` carries `minimum` + `scale`. `percentile` and `rank` carry `minimum` + **`of`** —
top 10% is 10 *of* 100, not 10 on a 4.0 scale. The validator originally required `scale` for
all three, which contradicted both this document and its own `alternatives` path (which reads
`of`), making a `rank` legal as an alternative and illegal at the top level. Fixed in
v0.32.0: the denominator field follows the kind, and a leftover `scale` on a portion is now
an error rather than being silently ignored.

### 3.4 `credits` is its own requirement, and a count is not a scale

The Erasmus Mundus programmes publish almost no GPA figure — but most publish a **credit
load**, and it is the only numeric academic gate they do state: *"a higher education degree
with a minimum of 240 ECTS-credit points"* (TERRA, NORISK, FRP++), *"a Bachelor's Degree
(180 ECTS)"* (MaMaSELF). Dropping that because it is not a grade would have meant discarding
the one enforceable threshold in the family.

It is its own **requirement** kind (`credits`, alongside `gpa` and `language`) because it is a
different thing being required: 240 ECTS is a statement about the *length and shape* of a
prior degree, not about grades earned in it.

It is its own **rule** kind (`count`) because it is a quantity, not a reading:

- it has **no ceiling** — 240 is not 240 *of* anything, and a graduate can hold 300;
- so it carries **neither `scale` nor `of`**, both of which would be fabrications;
- and it carries a mandatory **`unit`**, for the mirror-image reason a GPA carries a scale:
  240 credits means four different things in ECTS, US semester credit hours and the Nepali
  system. A `count` with no unit is as uncomparable as a `numeric` with no scale.

Where the required load differs by route — FRP++ needs 300 for tracks including UNINA, 240
otherwise — the lower figure goes in `minimum` and the difference is stated in `text` with
`varies_by`. A per-route `branches` was considered and rejected: two figures that depend on a
mobility track the reader has not chosen yet is not a branch the reader can pick from their
own profile.

### 3.5 Open item — a scale that runs downward

MS² states its bar three ways: *"an average grade higher or equal to B according to the ECTS
grading system, i.e. the best 35% of students (corresponding to a grade of up to 2.8 in the
German grading scale)"*. The 35% is recorded as `rank`; the German 2.8 is quoted in `text` and
**not** recorded as a figure, because the German scale runs *downward* — 1.0 is best — and
every numeric rule in this schema assumes higher is better. `compare.js` compares with `>=`
and the validator rejects a `minimum` above its own `scale` on that assumption.

Recording 2.8 as a `numeric` minimum would have produced the opposite verdict from the one
the provider means. A `direction` field (`higher-is-better` / `lower-is-better`) is the fix
and it is **not yet built**; until it is, an inverted-scale threshold is quoted, not encoded.

### Mapping to `src/compare.js` — every reason code already exists

| rule `kind` | verdict | reason | needs |
|---|---|---|---|
| `numeric` (scale matches the reader's) | `meets` / `fails` | — | a confirmed value with a scale |
| `numeric` (scale ≠ the reader's) | `unknown` | `unresolvable` | one side converted |
| `percentile` | `meets` / `fails` | — | a confirmed value *and* its percentile |
| `rank` | `unknown` | `unresolvable` | the reader's class rank |
| `branches` (one branch matches) | `meets` / `fails` | — | the reader's scale picks a branch |
| `branches` (no branch matches) | `unknown` | `unresolvable` | the reader picks, or a conversion rule |
| `prose` | `unknown` | `unresolvable` | a human read |
| `none-stated` | `unknown` | `no-requirement` | nothing — it is an answer |
| `unstated` | `unknown` | `not-recorded` | the sourcing pass |

**No new verdict and no new reason code is required.** The schema's job is to hold the data;
the engine's job is already done.

---

## 4. The five worked examples — the proof

These are the five records whose `gpa_minimum` is a prose string, and they were chosen
because they are the **hardest** case. If the schema holds these, it holds anything. All
five are transcribed verbatim into `data/requirements.json`.

| Record | `kind` | Why this shape |
|---|---|---|
| `gks-graduate` | `branches` | Four figures on four scales, plus a percentile and a rank alternative. `numeric` cannot hold it; it is genuinely a set of alternatives. |
| `mext-research-students` | `branches` | Two thresholds split by field, not by scale. Needs a way to say *which branch applies to whom*. |
| `groundwater-emjm` | `prose` | Two *different systems* (US letter grade, UK classification). Comparable only after a conversion, which the provider states as "or equivalent" rather than as a rule. |
| `kaust-fellowship` | `numeric` | The rare clean case: `3.0` on a `4.0` scale. The extra context (90% above 3.3) is **not** a requirement and is kept in `text`, not as a number to compare against. |
| `pec-pg-brazil` | `none-stated` | Explicitly no threshold. The single most important case, because it is the one that must never render as "we do not know". |

### What the examples established

- **`branches` needs to record *why* it branches.** GKS branches by scale (the reader's
  transcript decides); MEXT branches by field (the applicant's subject decides). Both are
  representable, but they are not the same kind of branch, so each branch carries an optional
  `applies_to` label. **Without it the UI cannot tell the reader which branch is theirs**,
  which would make the schema hold the data and still be useless.
- **`kaust-fellowship` splits context from requirement.** "Typically 90% of admitted
  applicants have a GPA above 3.3" is not a threshold and must never be compared against.
  It belongs in `text`. This is the same class of error as the catalog's own KAUST record
  printing an impossible "TOEFL iBT 5 overall" — a number that is present but not a rule.
- **`none-stated` is a real answer, not a gap.** `pec-pg-brazil` states the requirement is
  set programme by programme. That is a *finding*, and it must survive as one.

---

## 5. What the validator enforces

`scripts/validate-requirements.mjs`, added to the `npm test` chain:

1. `record_id` must exist in `data/scholarships.json` — a requirement for no record is a typo.
2. `kind` must be one of the seven. An eighth is a schema change, not a data edit.
3. `numeric` **must** carry both `minimum` and `scale`. A numeric requirement without a scale
   is rejected — it is the same defect as a GPA without a scale, on the other side.
4. A non-numeric kind **must not** carry `minimum` or `scale` — those belong inside `branches`.
5. Every branch must carry both `minimum` and `scale`.
6. `source` and `last_verified` are **mandatory on every requirement**. A requirement with no
   source is not verifiable; a requirement with no `last_verified` cannot be aged.
7. `last_verified` must be a real ISO date, not in the future.
8. `text` is mandatory on `prose` and `none-stated` — those kinds *are* their text.

Rule 6 is the one worth stating plainly: **a requirement is the thing that goes stale
fastest.** Providers change a threshold without changing the page, and there is no diff to
notice. `last_verified` is how the app can eventually say "this was checked 14 months ago"
rather than presenting a stale figure as current.

---

## 6. What this does not do

- **It does not change `data/scholarships.json`.** The five records keep their prose
  `gpa_minimum` untouched; the new file sits beside them. Nothing in the app reads it yet.
- **It does not invent a number.** Every value in the five examples is transcribed from the
  parent record's own text; none was computed, averaged, or converted.
- **It does not add a language-requirement shape.** The same problem exists for
  `language_requirements` (15 prose dicts), and it needs the same treatment, but the GPA
  case is the one that blocks the comparison engine, so it goes first.
- **It does not settle the sub-field question.** `program_field` is a flat set at one level
  ("Civil Engineering", not "Structural Engineering"). Whether a second level is needed is a
  separate decision, and the catalog's `fields` filter derives from the data, so adding one
  is additive when it happens.
