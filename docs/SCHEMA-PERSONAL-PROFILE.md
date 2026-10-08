# Schema — the reader's confirmed profile, and the requirements it compares against

**Status:** design proposal, written 2026-10-08. It describes the shape that makes
`src/compare.js` able to answer `meets`/`fails` instead of always `unknown`. Nothing here
is a data change to the catalog yet — that is §10 decision 1 in `DOCUMENT-INGESTION.md`,
and it is the owner's call.

This document answers one question: *what shape must the stored data have so that a
comparison between an applicant and a requirement is **reliable** (returns the same answer
every time) and **fast** (no scan, no inference, no model) later?*

Two schemas are needed, because a comparison needs two sides. The profile is §1; the
requirement side is §2. §3 is why neither can be flattened into "a number".

---

## 1. The personal profile — where confirmed facts live

Stored in `localStorage['sh-profile']`, alongside the hand-typed `field` / `degree` /
`nationality`. Today it holds both a display string and a structured value for every
extracted fact, and **that duplication is deliberate** — see rule 1 below.

```jsonc
{
  // --- hand-typed, never machine-read ---
  "field": "Civil Engineering",
  "degree": "Master",
  "nationality": "Nepal",
  "countries": [],

  // --- confirmed from a document (absent until the reader confirms) ---

  "gpaValue": {
    "value": 3.62,          // number, as read
    "scale": 4.0,           // number, MANDATORY — a GPA without a scale is not a value
    "from": "transcript.docx", // the file it was read from, for the reader's trust
    "confirmedAt": "2026-10-08T02:40:00.000Z"
  },
  "gpa": "3.62 / 4.0",      // display string, derived; the reader may also hand-type it

  "languageValue": {
    "instrument": "ielts",  // closed set: ielts | toefl | pte | duolingo
    "value": 7.0,
    "subs": [ {"skill":"L","value":7.5}, {"skill":"R","value":7.0} ],
    "from": "transcript.docx",
    "confirmedAt": "2026-10-08T02:40:00.000Z"
  },
  "language": "IELTS 7.0",  // display string

  "classification": {
    "value": "upper-second", // closed set: first | upper-second | lower-second | third
    "label": "Second Class Upper",
    "from": "transcript.docx",
    "confirmedAt": "2026-10-08T02:40:00.000Z"
  }
}
```

### Rules the shape encodes

1. **Every value carries both a structured form and a display string, and they are written
   together.** The structured form is what a comparison reads; the string is what the
   reader sees. Writing only one lets them drift — the reader edits the text, the comparison
   keeps the stale number, and the app confidently compares the wrong value. `confirmProposal`
   in `src/App.jsx` writes both in one `persist()` call for exactly this reason.

2. **`scale` is mandatory on a GPA, and its absence is a state, not a default.** There is no
   `scale ?? 4.0`. A value with no scale is stored with `scale: null` (or not confirmed at
   all) and the comparison returns `unknown` / `no-scale`. The catalog's own GKS record
   states its threshold four different ways depending on scale, which is the proof that
   assuming one invents a requirement.

3. **`instrument` and `classification.value` are closed sets, not free text.** `ielts` is a key;
   "IELTS" and "IELTS Academic" and "雅思" are not. A free-text instrument name makes the
   comparison a string match that fails silently on a spelling variant.

4. **`from` and `confirmedAt` exist so the value is auditable.** A confirmed value the reader
   cannot trace back to a document is a value they will eventually doubt and re-do. This
   is the same provenance discipline the catalog applies to its own records.

5. **Transient extractions are NOT stored.** A proposal list is a reading of a document that
   can be re-read at any time. Persisting it puts a stale transcript summary in
   `localStorage` for no gain, and creates a second source of truth that can disagree with
   the confirmed one. Only confirmations persist.

6. **No field is added for what the comparison does not read.** A `fullName`, `dateOfBirth`,
   `address` — none of these are compared against anything, so storing them widens the
   blast radius of a local-storage leak for zero feature value. This is a privacy decision
   expressed as a schema decision.

---

## 2. The requirement side — what a record must carry to be comparable

This is Phase 2, and it is a **data pass, not a code change**. The current shape is
`eligibility.gpa_minimum` — `null`, a number, or a prose string. The proposed shape
replaces the scalar with an object that can hold a rule which is not one number.

```jsonc
"eligibility": {
  "gpa": {
    "kind": "numeric",           // numeric | branches | prose | none-stated | unstated
    "minimum": 3.0,
    "scale": 4.0,                // MANDATORY when kind is numeric
    "source": "https://admissions.kaust.edu.sa/...",
    "last_verified": "2026-10-07"
  }
}
```

The `kind` discriminator is the whole point. Each value gets a distinct shape:

```jsonc
// kind: "branches" — GKS states a different figure per scale. This is NOT prose
// to be parsed; it is a set of alternatives the reader picks from.
{
  "kind": "branches",
  "branches": [
    { "minimum": 2.64, "scale": 4.0 },
    { "minimum": 2.80, "scale": 4.3 },
    { "minimum": 2.91, "scale": 4.5 },
    { "minimum": 3.23, "scale": 5.0 }
  ],
  "also_accepts": { "kind": "percentile", "minimum": 80, "of": 100 },
  "source": "https://www.studyinkorea.go.kr/...",
  "last_verified": "2026-10-07"
}

// kind: "prose" — mext-research-students is FIELD-dependent. There is no single
// threshold, so there is no number, and inventing one is a lie.
{
  "kind": "prose",
  "text": "The Embassy of Japan in Nepal requires 70% marks (CGPA 3.1) for Natural Sciences and 60% marks (CGPA 2.5) for Humanities",
  "varies_by": "field",
  "source": "https://www.np.emb-japan.go.jp/...",
  "last_verified": "2026-10-07"
}

// kind: "none-stated" — pec-pg-brazil states there is NO threshold.
// A different fact from "unstated", and it must not share a sentence with it.
{
  "kind": "none-stated",
  "quote": "No minimum GPA is stated in the Edital",
  "source": "https://...",
  "last_verified": "2026-10-07"
}

// kind: "unstated" — the catalog has not looked. This is the honest default.
{ "kind": "unstated" }
```

### Why `kind` and not just "a number or a string"

The current three-way shape (`null` / number / string) **cannot distinguish `none-stated`
from `unstated`** — both are "no number". But they are opposite claims: *"this provider has
no GPA threshold"* versus *"we have not checked this provider's threshold."* Collapsing them
makes the app lie in one direction or the other. The discriminator is what keeps
`unknown` from becoming a single undifferentiated bucket — and `src/compare.js` already has
the five distinct reason codes that a richer `kind` maps onto one-to-one:

| `kind` | verdict | reason | meaning |
|---|---|---|---|
| `numeric` (scale matches) | `meets` / `fails` | — | a real comparison |
| `numeric` (scale unrecorded) | `unknown` | `no-scale` | will not assume the reader's scale |
| `branches` | `unknown` | `unresolvable` | reader picks their branch |
| `prose` | `unknown` | `unresolvable` | no single scalar form |
| `none-stated` | `unknown` | `no-requirement` | provider says there is none |
| `unstated` / absent | `unknown` | `not-recorded` | catalog has not looked |
| *(no confirmed value)* | `unknown` | `no-value` | reader has not confirmed one |

**Every reason code already exists in `src/compare.js`.** Phase 2 does not add verdicts; it
fills in data the engine can already read.

### `source` and `last_verified` are not optional

A requirement with no `source` is not verifiable, and one with no `last_verified` cannot be
aged. The catalog already carries `source_url` on every record from the provenance pass;
this extends the same rule down to the requirement, because **a requirement is the thing
that goes stale fastest** — providers change a threshold without changing the page.

---

## 3. Why neither side can be flattened, and why no model is needed

Three consequences, each of which decides an architecture question:

**It is not a parsing problem.** `mext-research-students` has no scalar form — it is two
different thresholds for two different fields. A model asked to "extract the GPA
requirement" would return one number and be *wrong*, confidently. The schema's job is to
hold the rule as a rule.

**It is not a similarity problem.** `3.62/4.0` is not "similar to" `3.0/4.0`; it is at or
above it. Comparison is arithmetic on a shared scale, not distance in a vector space. No
embedding model is involved at any stage, and none should be.

**It is a representation problem.** The five prose requirements in the catalog are
*faithful records of rules with no scalar form*. They are not unstructured data awaiting a
parser; they are structured data awaiting a schema that can hold them. That is the whole
finding.

---

## 4. Storage and speed

The profile is a **single `localStorage` object under one key**, not a table. The catalog is
a static JSON array shipped with the bundle; the comparison is a `useMemo` over ~50 records.

- **Lookup is O(records) once per render, not per keystroke** — `compareAllGpa` is memoised
  on `[records, value]`.
- **No index is needed at 50 records.** An index becomes worth building somewhere in the
  thousands, and would be premature now. If the catalog ever grows past a few hundred, the
  index should be a `Map` keyed by requirement `kind` so the `unknown` records are skipped
  without touching them — a lookup, not a search.
- **No migration is needed for records that have no requirement.** `kind: "unstated"` is
  what an absent field already means, so the pass can be done one record at a time and the
  feature improves incrementally. It never goes dark for the records not yet done.

**Reliability comes from the two schemas, not from any model.** A comparison is trustworthy
when: both sides are stored in the same typed shape (§1 and §2), a value without a scale is
refused rather than defaulted (§1 rule 2), and a missing requirement is `unknown` rather
than a pass (`src/compare.js`). All three are properties of the data, and all three are
already enforced — the only thing missing is the Phase 2 sourcing pass that fills the
requirement side in.
