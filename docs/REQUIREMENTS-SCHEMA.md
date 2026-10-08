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
| `prose` | optional `varies_by`, optional `delegated_to` — the wording is the requirement's `text` | stated, but with no single scalar form; with `delegated_to`, the bar is somebody else's |
| `none-stated` | `quote` (the proof) | **the provider states there is no threshold** |
| `unstated` | nothing, and the requirement carries **no** `text` | **the catalog has not looked** — the honest default |

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
| **The bar is delegated** — the award requires admission to a programme that sets its own (Chevening's 2:1, Paris-Saclay's master's admission) | `prose` | the award genuinely publishes none; the bar exists elsewhere and is named |
| **The provider says its criteria are not yet published** (REM+ 2: *"currently under review … will be published shortly"*) | `prose` | the provider states something definite about the state of its own procedure — that is a finding, not an absence |
| The provider affirmatively says there is no threshold (Knight-Hennessy) | `none-stated` | the distinct fact |

**A qualifier the provider itself supplies is part of the finding.** EESIC scores *"Student's
ranking, **if available**"* and CGRS-D lists *"relative standing in program (**if available**)"*
among its indicators. Both providers know a class rank often does not exist — which is the same
fact this schema records as `unstated` on the reader's side, so a `rank` rule must never be
treated as answerable by default. The phrase is kept verbatim in `text` so the person wiring
`compare.js` can see that the provider expects `unknown` here too.

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

Batch 3 produced a **second** instance, which makes this a pattern rather than a curiosity.
CGRS-D's only numeric academic threshold is a **ceiling**, not a floor: *"no more than 36
months of full-time equivalent doctoral study"*. A `count` rule compares with `>=`, so 36
would have been recorded as a minimum you must exceed — the precise opposite of a cap. It is
quoted in `text` and not encoded, for the same reason as the German 2.8.

Two independent cases in two batches is the point at which an open item stops being an edge
case, so batch 4 was run under a standing trigger: **a third instance gets `direction` built
before the pass continues.** Batch 4 produced none and batch 5 produced none — neither the Pan
African University's age limits nor CGRS-D's month cap is an academic score on a downward scale
— so the trigger has not fired.

**Wiring the file in did not force it either**, contrary to an earlier prediction here: both
inverted cases are recorded as `prose`, so no rule in the data is currently inverted and nothing
numeric compares the wrong way. `direction` remains unbuilt and unneeded, with the trigger
standing.

### 3.6 The delegated bar is the dominant shape, not an edge case

Measured across the 31 records sourced so far: **5 carry a comparable GPA figure. 8 state
explicitly that the academic bar is set by somebody else.** The second number is larger than the
first, and it is not noise — it is how large programmes are actually administered.

| Record | Who actually sets the academic bar |
|---|---|
| `chevening-scholarship` | the UK university making the unconditional offer |
| `si-global-professionals` | University Admissions, not the Swedish Institute |
| `erasmus-mundus-joint-masters` | each consortium, per programme |
| `paris-saclay-international-masters` | the master's programme's own admission decision |
| `holland-scholarship` | each of 34 participating institutions |
| `msca-doctoral-networks` | each funded consortium, per EURAXESS vacancy |
| `nz-scholarships` | the applicant's preferred institution, in its own words |
| `anso-cas-twas-unesco-phd` | USTC/UCAS admission criteria for international students |

**This reframes what the file is for.** The instinct is that `requirements.json` exists to hold
thresholds. It mostly does not, and cannot: for a quarter of the records the honest and *useful*
answer is not a number but a pointer — *"this award has no academic bar of its own; the host
programme sets it"* is more actionable than any figure would be, because it tells the reader
which document to open.

The consequence for Phase 3: `unresolvable` is the wrong reason code for these. They are not
unresolvable — they are **delegated**, which is a definite answer, and rendering it as "we could
not work this out" would understate what is known. **Built in v0.37.0 as the `delegated` reason
code** — see §3.6.1 for the mechanism.

#### 3.6.1 Delegation is a field, not a phrase match

The first plan was to detect delegation by searching `text` for wording like *"set by the
university"* or *"each beneficiary recruits its own"*. That is not a mechanism: it breaks the
moment a provider words it differently, it fails silently when it does, and it would put a regex
on the read path of the app — the same defect class as inferring a reader's nationality from a
substring of a country name.

Delegation is instead **stated**:

```jsonc
{ "kind": "prose", "delegated_to": "the UK university making the unconditional offer" }
```

`delegated_to` is only meaningful on a `prose` rule — a rule carrying a figure is not delegated,
because a figure is already the answer — and it is forbidden on `unstated`, which is bare by
definition. The comparison then has something definite to say: *"This award sets no academic bar
of its own. It is set by the UK university making the unconditional offer."*

### 3.7 The wording has exactly one home

`text` lives on the **requirement**, never on the rule. `of.text` is not permitted.

This was not the original shape — the first five records put a `prose` finding's wording inside
the rule, on the reasoning that the rule "is its own explanation", and later records duplicated
it to the requirement. By the time it was measured, **17 records carried the identical string in
both fields and 7 carried it only on the rule.** Byte-identical was verified, not assumed: every
duplicate pair matched exactly, so collapsing them lost no wording (37 distinct strings before,
37 after).

The defect that mattered was not the duplication but the **7 records with no requirement-level
`text` at all** — a consumer reading `text` renders nothing for those, and a blank requirement
reads as "no requirement" rather than "not loaded". Two shapes, one of them silently empty, is
worse than either shape alone.

The rule now: **`text` is required on every requirement, except `unstated`, where it is
forbidden** — because there the absence *is* the finding, and a sentence would be a claim.

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

Every rule below is executable and each was observed to fail on a planted defect before it was
trusted. Kept in step with the code deliberately: this list said "one of the seven" and
described the old `text` rule for two releases after both had changed.

**Shape of the file**

1. The catalog root must be a JSON array; `requirements.json` must be an object keyed by record id.
2. `record_id` must exist in `data/scholarships.json` — a requirement for no record is a typo,
   and a typo means a requirement that silently never gets compared.
3. Each entry must carry a non-empty `requirements` array.
4. Requirement `kind` must be one of `gpa`, `language`, `credits`. A fourth is a code change.
5. `of` must be an object, and its `kind` one of the eight in §3.

**Numbers**

6. `numeric`, `percentile` and `rank` need a numeric `minimum` **and** the denominator that
   belongs to the kind — `scale` for `numeric`, `of` for a portion. A `minimum` above its own
   `scale` is rejected as not a reading.
7. `count` needs a numeric `minimum` **and** a non-empty `unit`, and must carry neither `scale`
   nor `of` — a quantity is not a portion and not a reading.
8. `branches` needs at least two branches, each with `minimum` + `scale`, and no top-level
   `minimum` or `scale`. One branch is the `numeric` kind. `alternatives` may hold
   `numeric`/`percentile`/`rank` entries, each with `minimum` + `of`.
9. `prose` and `none-stated` must not carry a number — they are recorded precisely because no
   single number holds them.

**Meaning**

10. `none-stated` needs a `quote`. It is a claim about what the provider says, so it carries
    the provider's words.
11. `unstated` must be bare, and must carry **no** `text` — the absence is the finding, and a
    sentence there would be a claim.
12. `rule.text` is never allowed. The wording lives on the requirement (§3.7).
13. `applies_to`, `varies_by` and `delegated_to`, when present, must be non-empty strings. A
    qualifier that silently does nothing is worse than no qualifier. `delegated_to` is only
    legal on a `prose` rule, and never on `unstated`.

**Provenance**

14. `source` and `last_verified` are mandatory on every requirement. A requirement with no
    source is not verifiable; one with no `last_verified` cannot be aged.
15. `last_verified` must be a real calendar date — `2026-02-30` is rejected — and not in the
    future. One 12 months old or older raises a warning.
16. `text` is required on every requirement except `unstated` (§3.7).

**One warning, not an error**

17. A comparable GPA figure in this file while the catalog record still has
    `eligibility.gpa_minimum = null` means the two files disagree about a number a reader can
    see. It is a warning rather than an error because the catalog is migrated separately.

Rule 14 is the one worth stating plainly: **a requirement is the thing that goes stale
fastest.** Providers change a threshold without changing the page, and there is no diff to
notice. `last_verified` is how the app can eventually say "this was checked 14 months ago"
rather than presenting a stale figure as current.

---

## 6. What this does not do

- **It does not change `data/scholarships.json`.** The 50 records keep their
  `eligibility.gpa_minimum` untouched; the new file sits beside them. **Nothing in the app
  reads it yet**, which is why the two warnings above are warnings and not failures.
- **It does not invent a number.** Every value is transcribed from the provider's own page and
  carries the URL and the date it was read. None was computed, averaged, or converted — and
  where a conversion would be needed (MS²'s German 2.8, the German *up to* reading) the figure
  is quoted rather than encoded.
- **It is not finished.** 31 of 50 records carry a requirement. The remaining 19 include two
  that are deliberately unsourced: `eth-excellence-scholarship`, whose eligibility text sits in
  JavaScript accordions that could not be read, and `fulbright-foreign-student`, which is
  administered by roughly fifty country commissions rather than by one programme.
- **It does not record selection weights, and that is a decision rather than an omission.**
  Two records publish a scoring rubric with explicit weights: CGRS-D (research potential 50%,
  relevant experience 50%) and JJ/WBGSP (professional experience 30%, recommendations 30%,
  commitment to the home country 30%, education background **10%**). A weight is genuinely
  useful — a reader optimising for JJ/WBGSP should learn that grades are the smallest of four
  components — but a weight is *not a requirement*. This file holds gates: what a reader must
  have. A rubric is how applicants are ordered once they clear the gates, and mixing the two
  would make `compare.js` answer "do I meet this?" with a number that means "how are you
  ranked?". The weights are quoted in `text`, which is where a fact that is not a gate belongs.
- **`language` is a requirement kind with a rule, and it is now in use.** TF MASA publishes real
  English thresholds (IELTS 6.5 with no band below 6, TOEFL iBT 93, CAE/CPE B/C, or a letter
  from the applicant's university) and they are recorded as a `language` requirement. The rule
  is `prose` rather than `numeric` because the alternatives sit on different scales — a band
  score out of 9, a TOEFL total, a Cambridge letter grade — and a single `numeric` would have
  to pick one and silently discard the rest.
- **It does not settle the sub-field question.** `program_field` is a flat set at one level
  ("Civil Engineering", not "Structural Engineering"). Whether a second level is needed is a
  separate decision, and the catalog's `fields` filter derives from the data, so adding one
  is additive when it happens.
